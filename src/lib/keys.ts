import { t } from "./i18n";
import type { MsgKey } from "./messages";
import { isMac } from "./platform";

/**
 * Kısayol eşleştirme. Kısayollar ayarlarda "Ctrl+Shift+H" biçiminde metin
 * olarak tutuluyor; kullanıcı düzenleyebilsin ve import/export ile taşınabilsin
 * diye. Burada o metni klavye olayıyla karşılaştırıyoruz.
 */

export interface ParsedCombo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** macOS'ta Cmd (⌘), Windows'ta Win tuşu. Ayrı tutulması şart: mac'te Ctrl
   *  kabuğun tuşu, Cmd arayüzün — ikisi karışırsa Ctrl+C hem SIGINT hem
   *  kopyalama olur. */
  meta: boolean;
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

  const result: ParsedCombo = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: "",
  };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "ctrl" || lower === "control") result.ctrl = true;
    else if (lower === "shift") result.shift = true;
    // "option" mac'te Alt tuşunun adı; ayarlardan elle yazan kullanıcı ikisini
    // de kullanabilmeli.
    else if (lower === "alt" || lower === "option" || lower === "opt") result.alt = true;
    // "cmd" / "command" / "meta" / "super" aynı tuş. Dört yazımın hepsi
    // kabul ediliyor: kısayollar settings.json'da metin olarak duruyor ve
    // başka bir makineden / sürümden gelebiliyor.
    else if (lower === "cmd" || lower === "command" || lower === "meta" || lower === "super")
      result.meta = true;
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
  // Meta de TAM eşleşmeli. Yoksa mac'te Cmd+T ile eşleşen bir "Ctrl+T"
  // tanımı, Cmd basılıyken de tetiklenirdi.
  if (event.metaKey !== parsed.meta) return false;

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
  // macOS'ta kısayollar simgeyle ve ARALIKSIZ yazılır (⌘⇧K), sistem
  // genelindeki yazım bu. Sıra da sabit: ⌃⌥⇧⌘ (Apple HIG).
  if (isMac()) return prettyMac(parsed);
  const parts: string[] = [];
  if (parsed.ctrl) parts.push("Ctrl");
  if (parsed.shift) parts.push("Shift");
  if (parsed.alt) parts.push("Alt");
  if (parsed.meta) parts.push("Win");
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

/**
 * macOS yazımı: simgeler, ayırıcı yok, sabit sıra.
 *
 * Sıra Apple'ın kuralı (HIG): Control, Option, Shift, Command. Ayarlarda
 * "Ctrl+Shift+K" yazan bir kısayolu mac kullanıcısına "⌃⇧K" olarak göstermek
 * onun sistemin geri kalanında gördüğü biçim; "Ctrl+Shift+K" yazmak hangi
 * tuşa basacağını düşündürüyor.
 */
function prettyMac(parsed: ParsedCombo): string {
  let out = "";
  if (parsed.ctrl) out += "⌃";
  if (parsed.alt) out += "⌥";
  if (parsed.shift) out += "⇧";
  if (parsed.meta) out += "⌘";
  const named: Record<string, string> = {
    tab: "⇥",
    enter: "↩",
    escape: "⎋",
    backspace: "⌫",
    delete: "⌦",
    " ": "Space",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    pageup: "⇞",
    pagedown: "⇟",
  };
  const key = parsed.key;
  return out + (named[key] ?? (key.length === 1 ? key.toUpperCase() : key));
}

/** Klavye olayından kısayol metni üretir; ayarlarda "tuşa bas" alanı için. */
export function comboFromEvent(event: KeyboardEvent): string | null {
  const key = event.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return null;
  const parts: string[] = [];
  // Sıra parseCombo'nun kabul ettiği her biçimde çalışıyor ama sabit tutmak
  // ayarlar dosyasını okunur kılıyor.
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  // Depolanan biçim her platformda "Cmd": settings.json taşınabilir olmalı ve
  // "Meta" kullanıcıya bir şey anlatmıyor.
  if (event.metaKey) parts.push("Cmd");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

/**
 * Eylem adı -> sözlük anahtarı.
 *
 * Ayarlar dosyasından gelen, burada karşılığı olmayan bir eylem adı olduğu
 * gibi gösteriliyor: başka bir sürümden gelen kısayol yüzünden liste boş
 * kalmasın.
 */
const ACTION_KEYS: Record<string, MsgKey> = {
  newTab: "action.newTab",
  closeTab: "action.closeTab",
  nextTab: "action.nextTab",
  prevTab: "action.prevTab",
  newGroup: "action.newGroup",
  commandPalette: "action.commandPalette",
  historyPanel: "action.historyPanel",
  historySearch: "action.historySearch",
  favorites: "action.favorites",
  settings: "action.settings",
  renameTab: "action.renameTab",
  toggleLock: "action.toggleLock",
  toggleViewMode: "action.toggleViewMode",
  clearTerminal: "action.clearTerminal",
  findInTerminal: "action.findInTerminal",
  copy: "action.copy",
  paste: "action.paste",
  zoomIn: "action.zoomIn",
  zoomOut: "action.zoomOut",
  zoomReset: "action.zoomReset",
};

export function actionLabel(action: string): string {
  const key = ACTION_KEYS[action];
  return key ? t(key) : action;
}
