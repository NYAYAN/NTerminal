import { baseName, shortenPath } from "./format";
import { t } from "./i18n";
import type { Profile, ShellKind, TabState } from "../types";

/**
 * Sekme etiketleri. Sekme çubuğu ile kenar çubuğu aynı adı göstermek zorunda,
 * o yüzden mantık tek yerde.
 */

/** Sekmenin gösterilecek adı. Kullanıcı ad verdiyse her zaman o kazanır. */
export function tabLabel(tab: TabState): string {
  const custom = tab.customTitle?.trim();
  if (custom) return custom;
  const dir = baseName(tab.cwd);
  if (dir) return dir;
  const title = tab.title?.trim();
  // Kabuk başlığı tam exe yolu olabiliyor (PowerShell böyle yapıyor);
  // o durumda sadece dosya adını göster.
  if (title) return /[\\/]/.test(title) ? baseName(title) : title;
  return t("tab.fallbackName");
}

/** Kullanıcı bu sekmeye elle ad verdi mi? Arayüzde küçük bir işaretle gösteriliyor. */
export function hasCustomTitle(tab: TabState): boolean {
  return !!tab.customTitle?.trim();
}

/**
 * Etiketin altında/yanında gösterilen ikincil satır.
 * Elle ad verilmişse klasör, verilmemişse son komut daha bilgilendirici.
 */
export function tabSubtitle(tab: TabState): string {
  if (hasCustomTitle(tab)) return shortenPath(tab.cwd, 2);
  return tab.lastCommand?.trim() || shortenPath(tab.cwd, 2);
}

const SHELL_BADGES: Record<ShellKind, string> = {
  pwsh: "PS7",
  "power-shell": "PS",
  cmd: "CMD",
  bash: "SH",
  wsl: "WSL",
  zsh: "ZSH",
  fish: "FISH",
  custom: "EXE",
};

/**
 * Komut satırı Claude Code'u mu başlatıyor? Öyleyse komut sürdükçe sekmede
 * kabuk rozetinin yerine Claude'un resmi çiziliyor.
 *
 * Kabuk entegrasyonu komutu YAZILDIĞI hâliyle bildiriyor (zsh'te preexec'in
 * `$1`i): takma ad açılmamış. `alias c=claude` kullanan birinin sekmesi bu
 * yüzden tanınmıyor.
 *
 * Zincirin her halkasına bakılıyor: `cd proje && claude` de Claude başlatıyor.
 * Tırnak içini ayırmıyoruz; `echo "x; claude"` gibi bir satır yanlış pozitif
 * verir ama bedeli komut sürerken görünen bir resim.
 */
export function isClaudeCommand(command: string | null | undefined): boolean {
  if (!command) return false;
  return command.split(/&&|\|\||[;|&]/).some((part) => startsClaude(part.trim().split(/\s+/)));
}

/** Komutun önüne yazılıp asıl programı çalıştıranlar. */
const WRAPPERS = new Set(["env", "command", "exec", "nohup", "time", "caffeinate"]);

/** Paketi indirip çalıştıranlar: `npx @anthropic-ai/claude-code`. */
const RUNNERS = new Set(["npx", "bunx", "pnpx"]);

function startsClaude(words: string[]): boolean {
  let i = 0;
  while (i < words.length) {
    // `ANTHROPIC_MODEL=... claude`
    if (/^[A-Za-z_]\w*=/.test(words[i])) i += 1;
    else if (WRAPPERS.has(words[i])) {
      i += 1;
      while (words[i]?.startsWith("-")) i += 1;
    } else break;
  }
  if (i >= words.length) return false;

  // Yol ve uzantı düşüyor: `~/.local/bin/claude`, Windows'ta `claude.cmd`.
  const name = baseName(words[i].replace(/^["']|["']$/g, "")).replace(/\.(exe|cmd|ps1)$/i, "");
  if (name === "claude") return true;
  if (!RUNNERS.has(name)) return false;
  const pkg = words.slice(i + 1).find((w) => !w.startsWith("-"));
  return !!pkg && /^@anthropic-ai\/claude-code(@|$)/.test(pkg);
}

/** Profilin kabuk türü için kısa kod: sekmede tek bakışta hangi kabuk olduğu belli olsun. */
export function shellBadge(profile: Profile | undefined): string {
  // Buraya yalnızca profil listesi TÜMDEN boşken düşülüyor (hiç kabuk
  // bulunamamış bir makine). Bilinmeyen bir kimlik `resolveProfile` içinde
  // karşılanıyor — gerekçesi orada.
  if (!profile) return "?";
  return SHELL_BADGES[profile.kind] ?? "EXE";
}

/**
 * Sekmenin profili.
 *
 * Kimlik bulunamazsa varsayılana, o da yoksa listenin ilkine düşüyor — Rust
 * tarafındaki `store::resolve_profile` ile AYNI sıra.
 *
 * ## Neden düşüş gerekiyor
 *
 * ÖLÇÜLEN HATA: kenar çubuğundaki sekmeler `?` rozetiyle çiziliyordu. Sebep,
 * sekmenin `profileId` alanının artık var olmayan bir profili göstermesi. İki
 * yoldan oluyor: bir profil silindiğinde ona bağlı sekmeler olduğu gibi
 * kalıyor, ve "Ayarları varsayılanlara döndür" profilleri yeniden üretip
 * hepsine YENİ kimlik veriyor (`settings_reset` → `detect_profiles`).
 *
 * Sekme bu durumda çalışmaya devam ediyor: Rust tarafı açarken varsayılana
 * düşüyor. Yani `?` gerçek bir bilinmezlik değildi, arayüzün tam eşleşme
 * araması ile kabuğun düşüş kuralı arasındaki farktı — rozet, sekmenin
 * gerçekte çalıştırdığı kabuktan başka bir şey söylüyordu.
 *
 * Bağı onarmak ayrı iş ve `tabs.ts` içindeki `healTabProfiles` yapıyor; burası
 * onarım işlemeden önceki çizimi de doğru gösteriyor.
 */
export function resolveProfile(
  profiles: Profile[],
  profileId: string | null | undefined,
  defaultProfileId?: string,
): Profile | undefined {
  return (
    profiles.find((p) => p.id === profileId) ??
    profiles.find((p) => p.id === defaultProfileId) ??
    profiles[0]
  );
}

/** Sekme için ipucu (tooltip) metni. */
export function tabTooltip(tab: TabState, profile: Profile | undefined): string {
  const lines = [tabLabel(tab)];
  if (profile) lines.push(profile.name);
  if (tab.cwd) lines.push(tab.cwd);
  if (tab.lastCommand) lines.push(t("tab.lastCommand", { command: tab.lastCommand }));
  lines.push(t(hasCustomTitle(tab) ? "tab.renamedHint" : "tab.nameHint"));
  return lines.join("\n");
}

/**
 * Grubun ekranda görünen adı.
 *
 * Gruplanmamış kovanın kayıtlı bir adı YOK (`name: ""`) ve olmamalı: adı
 * çeviriden geliyor. Kayıtlı olsaydı dil değiştiğinde menülerde ve durum
 * çubuğunda eski dilde takılı kalırdı — kullanıcının koymadığı bir ad için
 * bu bir hata olurdu.
 */
export function groupLabel(group: { name: string; ungrouped?: boolean }): string {
  return group.ungrouped ? t("group.ungrouped") : group.name;
}
