/**
 * Kısayol eşleştirme. Kısayollar ayarlarda "Ctrl+Shift+H" biçiminde metin
 * olarak tutuluyor; kullanıcı düzenleyebilsin ve import/export ile taşınabilsin
 * diye. Burada o metni klavye olayıyla karşılaştırıyoruz.
 */

export interface ParsedCombo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const ALIASES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  space: " ",
  plus: "=",
  minus: "-",
  del: "delete",
  ins: "insert",
  pgup: "pageup",
  pgdn: "pagedown",
};

export function parseCombo(combo: string): ParsedCombo | null {
  if (!combo) return null;
  const parts = combo
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const result: ParsedCombo = { ctrl: false, shift: false, alt: false, key: "" };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") result.ctrl = true;
    else if (lower === "shift") result.shift = true;
    else if (lower === "alt") result.alt = true;
    else result.key = ALIASES[lower] ?? lower;
  }
  return result.key ? result : null;
}

export function matchCombo(event: KeyboardEvent, combo: string): boolean {
  const parsed = parseCombo(combo);
  if (!parsed) return false;
  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.shiftKey !== parsed.shift) return false;

  const key = event.key.toLowerCase();
  if (key === parsed.key) return true;

  // Shift ile üretilen karakterlerde (Ctrl+Shift+= gibi) event.key farklı
  // olabilir; fiziksel tuş koduyla da deneyelim.
  const code = event.code.toLowerCase();
  if (code === `key${parsed.key}`) return true;
  if (code === `digit${parsed.key}`) return true;
  if (parsed.key === "=" && (code === "equal" || key === "+")) return true;
  if (parsed.key === "-" && (code === "minus" || key === "_")) return true;
  if (parsed.key === "," && code === "comma") return true;
  return false;
}

/** Kısayolu görselleştirmek için düzgün biçim: "ctrl+shift+h" -> "Ctrl+Shift+H" */
export function prettyCombo(combo: string): string {
  const parsed = parseCombo(combo);
  if (!parsed) return combo;
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.shift) parts.push("Shift");
  if (parsed.alt) parts.push("Alt");
  const key = parsed.key;
  const named: Record<string, string> = {
    tab: "Tab",
    enter: "Enter",
    escape: "Esc",
    " ": "Space",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
  };
  parts.push(named[key] ?? (key.length === 1 ? key.toUpperCase() : key));
  return parts.join("+");
}

/** Klavye olayından kısayol metni üretir; ayarlarda "tuşa bas" alanı için. */
export function comboFromEvent(event: KeyboardEvent): string | null {
  const key = event.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

export const ACTION_LABELS: Record<string, string> = {
  newTab: "Yeni sekme",
  closeTab: "Sekmeyi kapat",
  nextTab: "Sonraki sekme",
  prevTab: "Önceki sekme",
  newGroup: "Yeni grup",
  commandPalette: "Komut paleti",
  historyPanel: "Geçmiş panelini aç/kapat",
  historySearch: "Geçmişte hızlı arama",
  favorites: "Favori komutlar",
  settings: "Ayarlar",
  renameTab: "Sekmeyi yeniden adlandır",
  toggleLock: "Sekme kilidini aç/kapat",
  clearTerminal: "Terminali temizle",
  findInTerminal: "Terminalde ara",
  copy: "Kopyala",
  paste: "Yapıştır",
  zoomIn: "Yazıyı büyült",
  zoomOut: "Yazıyı küçült",
  zoomReset: "Yazı boyutunu sıfırla",
};
