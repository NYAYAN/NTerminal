import { useEffect, useState } from "react";

import { useT } from "../lib/i18n";
import { keyBarInfo } from "../lib/keyPrograms";
import { sessions, useStore } from "../store/useStore";

interface KeyBarProps {
  tabId: string;
  /** Ön plandaki programın adı (`pty_foreground`); okunamadıysa null. */
  program: string | null;
  /** Çalışan komutun metni; ad okunamadığında ad buradan çıkıyor. */
  command: string | null;
  /** Klavyeden gelen ilk durdurma basışı (bkz. `armStop`). */
  armed: boolean;
  /** Kutunun satır yüksekliği: çubuk kutuyla aynı ölçüde. */
  rowStyle: React.CSSProperties;
}

/**
 * Tam ekran programda (vim, less, htop) komut kutusunun YERİNE gelen çubuk.
 *
 * BİLDİRİLEN: "`git pull` dediğimde komut yazın kısmında değil üst kısımda
 * `:q!` yazmak gerekiyor; her şey komut yazın kısmında olmalı." Eskiden kutu
 * tam ekranda hiç çizilmiyordu: yazılan yer yer değiştiriyor, git'in açtığı
 * vim'den nasıl çıkılacağını kimse söylemiyordu.
 *
 * Çubuk YAZILAN YERİ ve çıkış yolunu taşıyor: programın adı, tuşların nereye
 * gittiği, bilinen programlar için tek tık eylemler ("Kaydet ve çık").
 * Tuşların kendisi xterm'e gidiyor — kodlamayı (F tuşları, değiştiriciler,
 * IME, köşeli yapıştırma) o yapıyor; gerekçe `lib/inputMode.ts` başında.
 * Yazılan da programın ekranında görünüyor: vim'in komut satırı çubuğun hemen
 * üstünde.
 *
 * Ölçüsü kutuyla aynı (`.command-running` + `rowStyle`). Kutu eskiden tam
 * ekranda kaybolunca terminal büyüyor ve programa girişte ve çıkışta birer
 * SIGWINCH gidiyordu; aynı yükseklikteki çubuk bunu da kapattı.
 *
 * Odak KESİNLİKLE çubuğa geçmiyor: düğmeler `mousedown`ı engelliyor, çubuğa
 * basmak odağı programa veriyor. Odak çubuktaki bir düğmede kalsaydı yazılan
 * hiçbir yere gitmez, vim de odak kaybı bildirimi alırdı.
 */
export function KeyBar({ tabId, program, command, armed, rowStyle }: KeyBarProps) {
  const t = useT();
  const info = keyBarInfo(program, command);
  const focused = useTerminalFocus();
  const className = ["command-running", "keys", armed && "armed", focused && "focused"]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={rowStyle}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
        sessions.get(tabId)?.focus();
      }}
    >
      <span className="running-dot" aria-hidden="true" />
      <span className="keys-name">{info.name ?? t("input.keysProgram")}</span>
      <span className="running-text">{armed ? t("input.stopAgain") : t(info.hint)}</span>
      <span className="spacer" />
      {info.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="keys-action"
          title={t("input.keysActionTitle", { keys: action.shown })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => sessions.get(tabId)?.sendKeys(action.keys)}
        >
          {t(action.label)}
        </button>
      ))}
      {/* Bilinen programda çıkış düğmelerde; Durdur yalnızca onlar yokken.
          vim kesmeyi yok sayıyor, git'in açtığı vim'de ise kesme git'i
          öldürüp vim'i sahipsiz bırakırdı. */}
      {info.actions.length === 0 && (
        <button
          type="button"
          className="running-stop"
          title={t("input.stopTitle")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => useStore.getState().stopRunning(tabId)}
        >
          {armed ? t("input.stopAgainShort") : t("input.stop")}
        </button>
      )}
    </div>
  );
}

/** Odak bir terminalde mi: xterm'in gizli metin kutusu `.term-wrap` içinde. */
const terminalFocused = () => !!document.activeElement?.closest(".term-wrap");

/**
 * Çubuğun odak hâli: programa yazılabiliyor mu?
 *
 * `focusout` anında odak henüz yeni yerine geçmemiş oluyor; bakış bir sonraki
 * göreve bırakılıyor. Pencere odağı kaybedince de `focusout` geliyor.
 */
function useTerminalFocus(): boolean {
  const [focused, setFocused] = useState(terminalFocused);
  useEffect(() => {
    const update = () => setFocused(terminalFocused());
    const later = () => window.setTimeout(update, 0);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return focused;
}
