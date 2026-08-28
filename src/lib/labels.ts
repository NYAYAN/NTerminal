import { baseName, shortenPath } from "./format";
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
  return "sekme";
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
  custom: "EXE",
};

/** Profilin kabuk türü için kısa kod: sekmede tek bakışta hangi kabuk olduğu belli olsun. */
export function shellBadge(profile: Profile | undefined): string {
  if (!profile) return "?";
  return SHELL_BADGES[profile.kind] ?? "EXE";
}

/** Sekme için ipucu (tooltip) metni. */
export function tabTooltip(tab: TabState, profile: Profile | undefined): string {
  const lines = [tabLabel(tab)];
  if (profile) lines.push(profile.name);
  if (tab.cwd) lines.push(tab.cwd);
  if (tab.lastCommand) lines.push(`son komut: ${tab.lastCommand}`);
  lines.push(
    hasCustomTitle(tab)
      ? "elle adlandırıldı — çift tıkla değiştir, boş bırak sıfırla"
      : "çift tıkla ad ver",
  );
  return lines.join("\n");
}
