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
  // Fiziksel tuş adıyla kaydedilmiş kısayol ("NumpadAdd", "BracketRight"):
  // "+" karakteri ayırıcıyla çakıştığı için öyle saklanıyor (bkz.
  // `comboFromEvent`). Tuş adları (`tab`, `enter`) zaten yukarıda eşleşiyor.
  if (code === parsed.key) return true;
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
    delete: "Del",
    " ": "Space",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    numpadadd: "Num +",
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
    numpadadd: "Num +",
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
  parts.push(key === "+" ? plusKeyName(event.code) : key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

/**
 * "+" karakterini üreten tuşun saklanacak adı.
 *
 * "+" kısayol metninin AYIRICISI. Olduğu gibi yazılınca ⌘⇧= "Shift+Cmd++"
 * olarak saklanıyor, `parseCombo` onu bölünce tuş kalmıyor ve kısayol tümden
 * ölüyordu (ÖLÇÜLDÜ: yakınlaştırma kısayolu bu yolla bozuldu). Karakter yerine
 * FİZİKSEL tuş yazılıyor; Shift zaten ayrıca kaydedildiği için eşleşme aynı:
 *
 *  - ABD düzeni: Shift+= → "=" (`matchCombo`daki `equal` kuralı)
 *  - Türkçe Q: Shift+4 → "4" (`digit` kuralı)
 *  - Sayısal tuş takımı → "NumpadAdd"; tanınmayan düzenlerde de tuşun kodu.
 */
function plusKeyName(code: string): string {
  if (code === "Equal") return "=";
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  return code || "Plus";
}

/**
 * Kısayolun karşılaştırılabilir biçimi: değiştiriciler + tuş.
 *
 * "Ctrl+Shift+T" ile "shift+ctrl+t" aynı tuş; çakışma aranırken metin değil
 * bu karşılaştırılıyor. Okunamayan kısayol `null`.
 */
export function canonicalCombo(combo: string): string | null {
  const parsed = parseCombo(combo);
  if (!parsed) return null;
  const mods = [parsed.ctrl, parsed.shift, parsed.alt, parsed.meta].map((m) => (m ? 1 : 0)).join("");
  return `${mods}:${parsed.key}`;
}

/**
 * Aynı tuşa atanmış eylemler: eylem -> onunla çakışan ÖTEKİ eylemler.
 *
 * Çakışma sessiz bir arıza: genel dinleyici eylemleri sabit bir sırayla
 * deniyor ve ilk eşleşen kazanıyor, öteki eylem kısayoldan hiç
 * çalıştırılamıyor ve bunun hiçbir belirtisi yok. Ayarlar penceresi bu
 * haritayla iki satırı da uyarıyor.
 */
export function comboConflicts(bindings: Record<string, string>): Map<string, string[]> {
  const byCombo = new Map<string, string[]>();
  for (const [action, combo] of Object.entries(bindings)) {
    const canon = canonicalCombo(combo);
    if (!canon) continue;
    byCombo.set(canon, [...(byCombo.get(canon) ?? []), action]);
  }
  const out = new Map<string, string[]>();
  for (const actions of byCombo.values()) {
    if (actions.length < 2) continue;
    for (const action of actions) out.set(action, actions.filter((a) => a !== action));
  }
  return out;
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
  filePalette: "action.filePalette",
  textSearch: "action.textSearch",
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

/**
 * Kısayolların ayarlar penceresindeki gruplaması.
 *
 * Önceki hâli `settings.keybindings`in kendi sırasıydı — yani Rust'ın
 * `BTreeMap`inden gelen, eylem KİMLİĞİNE göre alfabetik sıra
 * (`clearTerminal`, `closeTab`, `commandPalette`, `copy`…). Kullanıcı için
 * rastgeleydi: "Yeni sekme" ile "Sekmeyi kapat" listenin iki ucundaydı.
 * Grup içi sıra da burada: en sık kullanılan önce.
 */
export const ACTION_GROUPS: { key: MsgKey; actions: string[] }[] = [
  {
    key: "keys.groupTabs",
    actions: ["newTab", "closeTab", "nextTab", "prevTab", "renameTab", "toggleLock", "newGroup"],
  },
  { key: "keys.groupClipboard", actions: ["copy", "paste"] },
  {
    key: "keys.groupSearch",
    actions: [
      "commandPalette",
      "filePalette",
      "textSearch",
      "findInTerminal",
      "historySearch",
      "historyPanel",
      "favorites",
    ],
  },
  {
    key: "keys.groupScreen",
    actions: ["toggleViewMode", "clearTerminal", "zoomIn", "zoomOut", "zoomReset"],
  },
  { key: "keys.groupApp", actions: ["settings"] },
];

/**
 * Kısayolları gruplarına dağıtır; hiçbir gruba girmeyenler (başka bir
 * sürümden gelen eylemler) en sonda "Diğer" altında. Boş grup dönmüyor.
 */
export function groupBindings(
  bindings: Record<string, string>,
): { key: MsgKey; actions: string[] }[] {
  const known = new Set(ACTION_GROUPS.flatMap((g) => g.actions));
  const groups = ACTION_GROUPS.map((g) => ({
    key: g.key,
    actions: g.actions.filter((a) => a in bindings),
  }));
  const rest = Object.keys(bindings).filter((a) => !known.has(a));
  if (rest.length > 0) groups.push({ key: "keys.groupOther", actions: rest });
  return groups.filter((g) => g.actions.length > 0);
}
