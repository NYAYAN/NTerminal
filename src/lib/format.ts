import { localeTag, t } from "./i18n";

/** Geçmiş listesinde okunabilir zaman: bugünse saat, dünse "dün", öncesi tarih. */
export function formatWhen(ms: number): string {
  if (!ms) return "";
  const date = new Date(ms);
  const now = new Date();
  const locale = localeTag();
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return t("unit.yesterday", { time });

  return `${date.toLocaleDateString(locale, { day: "numeric", month: "short" })} ${time}`;
}

export function formatFullDate(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString(localeTag());
}

export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "";
  if (ms < 1000) return t("unit.ms", { n: ms });
  if (ms < 60_000) {
    const s = ms / 1000;
    return t("unit.sec", { n: s < 10 ? s.toFixed(1) : Math.round(s) });
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return t("unit.minSec", { m: minutes, s: seconds });
  const hours = Math.floor(minutes / 60);
  return t("unit.hourMin", { h: hours, m: minutes % 60 });
}

export function formatBytes(bytes: number): string {
  // Birimler her iki dilde de aynı; yerelleştirilecek bir şey yok.
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Yolun son parçası; sekme başlığı için. */
export function baseName(path: string | null): string {
  if (!path) return "";
  const clean = path.replace(/[\\/]+$/, "");
  const parts = clean.split(/[\\/]/);
  const last = parts[parts.length - 1];
  // "C:" gibi kök yollar için sürücü harfini geri ver.
  return last || clean;
}

/** Uzun yolları baştan kısaltır: `...\Work\NYAYAN\NTerminal` */
export function shortenPath(path: string | null, maxSegments = 3): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= maxSegments) return path;
  // Ayırıcı YOLUN KENDİSİNDEN alınıyor, platformdan değil: `/Users/ali/proje`
  // mac'te `…\Users\ali\proje` diye gösterilirse yol tanınmaz hâle geliyor.
  // Yolun kendi biçimine bakmak ayrıca içe alınan (import) bir yapılandırmadan
  // gelen Windows yolunu mac'te de doğru gösteriyor.
  const sep = path.includes("\\") && !path.includes("/") ? "\\" : "/";
  return `…${sep}${parts.slice(-maxSegments).join(sep)}`;
}

/**
 * Basit alt dizi eşleşmesi (fuzzy): aranan harflerin sırayla geçmesi yeterli.
 * Eşleşirse puan döner (küçük = daha iyi), eşleşmezse null.
 */
export function fuzzyScore(text: string, query: string): number | null {
  if (!query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  const direct = haystack.indexOf(needle);
  if (direct !== -1) return direct; // tam alt dizi: en iyi puanlar

  let score = 1000;
  let at = 0;
  for (const ch of needle) {
    const found = haystack.indexOf(ch, at);
    if (found === -1) return null;
    score += found - at;
    at = found + 1;
  }
  return score;
}
