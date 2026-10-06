import { useT } from "../lib/i18n";
import { prettyCombo } from "../lib/keys";
import { isMac } from "../lib/platform";
import type { MsgKey } from "../lib/messages";
import { useStore } from "../store/useStore";
import { MatchCaseIcon, RegexIcon, WholeWordIcon } from "./Icons";
import type { SearchFlags } from "../types";

type Flag = keyof SearchFlags;

/** Seçeneğin tuşundaki harf: Alt+C / Alt+W / Alt+R. */
const LETTER: Record<Flag, string> = { caseSensitive: "C", wholeWord: "W", regex: "R" };

/**
 * Kutudayken seçeneği değiştiren tuş — VS Code'unkiyle aynı: Windows'ta
 * Alt+C / W / R, mac'te ⌥⌘C / W / R.
 *
 * mac'te yalnızca ⌥ yetmiyor: ⌥C bir harf yazıyor ("ç"); kutu o tuşu harf
 * olarak beklerdi. Harf `code`dan okunuyor, `key`den değil — aynı sebeple ve
 * klavye düzeninden (Türkçe F) bağımsız kalsın diye.
 */
export function flagForKey(event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "code">): Flag | null {
  const mod = isMac()
    ? event.altKey && event.metaKey && !event.ctrlKey
    : event.altKey && !event.ctrlKey && !event.metaKey;
  if (!mod || event.shiftKey) return null;
  if (event.code === "KeyC") return "caseSensitive";
  if (event.code === "KeyW") return "wholeWord";
  if (event.code === "KeyR") return "regex";
  return null;
}

/** Seçeneği tersine çevirir; palet ve dosya sütunu aynı seçenekleri paylaşıyor. */
export function toggleFlag(flag: Flag) {
  const store = useStore.getState();
  const flags = store.ui.searchFlags;
  store.setUi({ searchFlags: { ...flags, [flag]: !flags[flag] } });
}

/**
 * Arama kutusunun sağındaki üç seçenek: Aa, tam sözcük, düzenli ifade.
 *
 * `onMouseDown` varsayılanı engelliyor: düğmeye basmak odağı kutudan almasın,
 * kullanıcı seçeneği açıp yazmaya devam edebilsin.
 */
export function SearchToggles() {
  const t = useT();
  const flags = useStore((s) => s.ui.searchFlags);

  const item = (flag: Flag, label: MsgKey, Icon: typeof MatchCaseIcon) => {
    const combo = prettyCombo(isMac() ? `Cmd+Alt+${LETTER[flag]}` : `Alt+${LETTER[flag]}`);
    return (
      <button
        type="button"
        className={flags[flag] ? "search-toggle on" : "search-toggle"}
        data-flag={flag}
        aria-pressed={flags[flag]}
        title={`${t(label)} (${combo})`}
        aria-label={t(label)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => toggleFlag(flag)}
      >
        <Icon size={14} />
      </button>
    );
  };

  return (
    <span className="search-toggles">
      {item("caseSensitive", "search.caseSensitive", MatchCaseIcon)}
      {item("wholeWord", "search.wholeWord", WholeWordIcon)}
      {item("regex", "search.regex", RegexIcon)}
    </span>
  );
}
