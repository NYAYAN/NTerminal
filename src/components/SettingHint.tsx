import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useT } from "../lib/i18n";
import { InfoIcon } from "./Icons";

/**
 * Ayar açıklaması — satırın sağındaki "i" düğmesinin arkasında.
 *
 * ## Neden düğmenin arkasında
 *
 * Açıklamalar önce her ayarın altında duran soluk satırlardı. Ölçülen: bir
 * ayar satırı 31px, altındaki açıklama tek satırsa 17px, iki satıra sarınca
 * 33px — yani açıklaması olan bir ayar, açıklaması olmayanın iki katı yer
 * kaplıyordu. Oturum bölümünde altı ayarın dördü açıklamalıydı ve bölümün
 * yüksekliğinin yarısı açıklamaydı. Kullanıcının sözleri: "çok yer kaplıyor
 * ekranda ve bütünlük kayboluyor" — ikinci kısım birincisinden önemli, çünkü
 * ayarlar arasındaki düzenli ritmi bozan şey açıklamaların değişken
 * yüksekliği.
 *
 * Açıklama METNİ kaybolmuyor: aramada hâlâ eşleşiyor (`settingsIndex` ipucu
 * anahtarlarını da tarıyor) ve tek tıkla ekranda.
 *
 * ## Neden tıklamayla, üzerine gelmeyle değil
 *
 * Üzerine gelince açılan bir katman, fareyle listede gezinirken ardı ardına
 * açılıp kapanır; ayrıca dokunmatik ekranda karşılığı yok. Tıklama açık bir
 * niyet: kullanıcı o ayarı sordu.
 *
 * ## Esc BİLİNÇLİ olarak ele alınmıyor
 *
 * `App` içindeki genel kısayol dinleyicisi `window`da capture fazında duruyor
 * ve Esc'yi ayarlar penceresini kapatmak için kullanıyor; daha içteki bir
 * dinleyici oraya yetişemez (deneme: `document` capture da sonra çalışıyor).
 * Katmanı kapatmanın iki yolu var ve ikisi de elde: düğmeye yeniden basmak,
 * ya da başka bir yere tıklamak.
 */

interface HintState {
  /** Açık olan açıklamanın kimliği; hiçbiri açık değilse `null`. */
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

const HintContext = createContext<HintState>({ openId: null, setOpenId: () => {} });

/**
 * Açıklamaları saran kap: aynı anda YALNIZCA BİR açıklama açık kalıyor.
 *
 * İkisi birden açıkken hangi katmanın hangi satıra ait olduğu okunmuyor —
 * katmanlar satırın altına doğru açıldığı için alttaki ayarın üstüne biniyor
 * ve iki katman üst üste geldiğinde ekran karışıyor.
 *
 * Bölüm değiştiğinde kabın `key`i değişmeli (bkz. `SettingsDialog`): `useId`
 * ağaçtaki KONUMA göre kimlik üretiyor, yani yeni bölümdeki aynı konumdaki
 * açıklama eskisiyle aynı kimliği alıp kendiliğinden açık görünürdü.
 */
export function SettingHints({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);
  return <HintContext.Provider value={value}>{children}</HintContext.Provider>;
}

export function SettingHint({ children }: { children: ReactNode }) {
  const t = useT();
  const id = useId();
  const { openId, setOpenId } = useContext(HintContext);
  const open = openId === id;
  const box = useRef<HTMLSpanElement>(null);

  /**
   * Başka bir yere tıklamak katmanı kapatıyor.
   *
   * Capture fazında: ayarlar penceresinin örtüsü `mousedown` ile kapanıyor ve
   * pencere dışına tıklandığında ikisinin de olması doğru — katman kapanır,
   * pencere kapanır. Katmanın KENDİ içine tıklamak kapatmıyor, yoksa
   * açıklamadaki metni seçip kopyalamak mümkün olmazdı.
   */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpenId(null);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, setOpenId]);

  return (
    <span className="info" ref={box}>
      <button
        type="button"
        className={open ? "info-btn on" : "info-btn"}
        aria-expanded={open}
        aria-label={t(open ? "settings.hintHide" : "settings.hintShow")}
        title={t(open ? "settings.hintHide" : "settings.hintShow")}
        onClick={() => setOpenId(open ? null : id)}
      >
        <InfoIcon size={13} />
      </button>
      {open && (
        <div className="info-pop" role="tooltip">
          {children}
        </div>
      )}
    </span>
  );
}
