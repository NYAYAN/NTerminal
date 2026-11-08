import { baseName, shortenPath } from "./format";
import { t } from "./i18n";
import type { Group, Profile, ShellKind, TabState } from "../types";

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
  return commandSegments(command).some((part) => startsClaude(segmentProgram(part)));
}

/**
 * Zincirin SON halkasının çalıştırdığı program: `cd proje && vim x` → `vim`,
 * `git log | less` → `less`.
 *
 * Tam ekran çubuğu (`KeyBar`) ön plandaki programın adını okuyamadığında
 * (Windows'ta grup bilgisi yok) adı buradan alıyor. Son halka, çünkü ekranı
 * yöneten program zincirin sonunda çalışıyor; boş halkalar (`a &`) atlanıyor.
 */
export function commandProgram(command: string | null | undefined): string | null {
  if (!command) return null;
  const parts = commandSegments(command);
  for (let i = parts.length - 1; i >= 0; i--) {
    const program = segmentProgram(parts[i]);
    if (program) return program.name;
  }
  return null;
}

/** Komut zincirinin halkaları: `&&`, `||`, `;`, `|`, `&`. */
function commandSegments(command: string): string[] {
  return command.split(/&&|\|\||[;|&]/);
}

/** Komutun önüne yazılıp asıl programı çalıştıranlar. */
const WRAPPERS = new Set(["env", "command", "exec", "nohup", "time", "caffeinate"]);

/** Paketi indirip çalıştıranlar: `npx @anthropic-ai/claude-code`. */
const RUNNERS = new Set(["npx", "bunx", "pnpx"]);

interface SegmentProgram {
  /** Yolu ve uzantısı düşmüş ad: `~/.local/bin/claude`, `claude.cmd` → `claude`. */
  name: string;
  /** Adın ardından gelen sözcükler. */
  args: string[];
}

/**
 * Bir halkanın çalıştırdığı program.
 *
 * Ortam atamaları (`ANTHROPIC_MODEL=... claude`) ve asıl programı çalıştıran
 * sarmalayıcılar (`env`, `nohup`, `time`…) seçenekleriyle birlikte atlanıyor.
 */
function segmentProgram(segment: string): SegmentProgram | null {
  const words = segment.trim().split(/\s+/);
  let i = 0;
  while (i < words.length) {
    if (/^[A-Za-z_]\w*=/.test(words[i])) i += 1;
    else if (WRAPPERS.has(words[i])) {
      i += 1;
      while (words[i]?.startsWith("-")) i += 1;
    } else break;
  }
  if (i >= words.length || !words[i]) return null;
  const name = baseName(words[i].replace(/^["']|["']$/g, "")).replace(/\.(exe|cmd|ps1)$/i, "");
  return name ? { name, args: words.slice(i + 1) } : null;
}

function startsClaude(program: SegmentProgram | null): boolean {
  if (!program) return false;
  if (program.name === "claude") return true;
  if (!RUNNERS.has(program.name)) return false;
  const pkg = program.args.find((w) => !w.startsWith("-"));
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

/**
 * Sekme için ipucu (tooltip) metni.
 *
 * Son satır adlandırmanın yolunu söylüyor ("Çift tıkla ad ver"). Çift tıkın
 * ad değiştirmediği yerde (Kokpit rayının sekme ağacı) `nameHint` false:
 * olmayan bir yolu önermesin.
 */
export function tabTooltip(tab: TabState, profile: Profile | undefined, nameHint = true): string {
  const lines = [tabLabel(tab)];
  if (profile) lines.push(profile.name);
  if (tab.cwd) lines.push(tab.cwd);
  if (tab.lastCommand) lines.push(t("tab.lastCommand", { command: tab.lastCommand }));
  if (nameHint) lines.push(t(hasCustomTitle(tab) ? "tab.renamedHint" : "tab.nameHint"));
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

/**
 * Grubun rayda görünen iki harfi.
 *
 * Adda iki büyük harf varsa onlar ("NTerminal" → NT, "CopyBoard" → CB); yoksa
 * birden çok sözcükte ilk iki sözcüğün baş harfleri ("Yeni grup" → YG); tek
 * sözcükte ilk iki harf ("Sunucular" → Su). Türkçe büyük harf kuralı geçerli
 * ("istemci" → İs).
 */
export function groupInitials(group: Pick<Group, "name">): string {
  const name = group.name.trim();
  if (!name) return "·";
  const capitals = [...name].filter((ch) => ch !== ch.toLocaleLowerCase("tr") && /\p{L}/u.test(ch));
  if (capitals.length >= 2) return capitals.slice(0, 2).join("");
  const words = name.split(/[\s_\-./]+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((word) => [...word][0].toLocaleUpperCase("tr"))
      .join("");
  }
  const letters = [...name];
  return letters[0].toLocaleUpperCase("tr") + (letters[1] ?? "").toLocaleLowerCase("tr");
}
