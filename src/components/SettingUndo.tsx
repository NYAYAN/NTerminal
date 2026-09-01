import { useT } from "../lib/i18n";
import { UndoIcon } from "./Icons";

/**
 * "Bu değişikliği geri al" düğmesi — yalnızca AÇIK OTURUMDA değişmiş ayarda.
 *
 * Kullanıcının isteği iki adımda netleşti. Önce: "ayarlarda bir şey
 * değiştirince, ayarları sıfırla gibi bir şey olması gerekir". Sonra ölçüt:
 * "ben anlık olarak değişiklik yaptıysam satır bazlı geri al gelmeli. çıkış
 * yapıp giriş yaptıysam artık görmemeliyim. genel sıfırla ile eski haline
 * çevirebilirim".
 *
 * ## Ölçüt VARSAYILAN DEĞİL, PENCERE AÇILDIĞI AN
 *
 * İlk sürüm ayarı fabrika varsayılanıyla karşılaştırıyordu. Sonuç: kullanıcının
 * aylar önce kurduğu her ayar "değişmiş" sayılıyor ve neredeyse her satırda bir
 * düğme duruyordu — yani düğme hiçbir şey söylemiyordu. Şimdi ölçüt ayarlar
 * penceresinin açıldığı andaki değer:
 *
 *  - Bir ayarı deneyip beğenmezsen düğme orada, tek tıkla eski değer geliyor.
 *  - Pencereyi kapatıp açtığında (ya da uygulamayı yeniden başlattığında)
 *    değişiklik artık "yeni" değil; düğme kayboluyor.
 *  - Fabrika ayarlarına dönmek isteyen altlıktaki "Ayarları sıfırla"yı
 *    kullanıyor. İki iş, iki düğme.
 *
 * Bu ayrım aynı zamanda ikinci bir soruyu cevaplıyor: "şimdi burada neyi
 * değiştirdim?" Ekranda duran düğmeler tam olarak o listeyi gösteriyor.
 */
export function SettingUndo({ changed, onUndo }: { changed: boolean; onUndo: () => void }) {
  const t = useT();
  if (!changed) return null;
  return (
    <span className="undo">
      <button
        type="button"
        className="undo-btn"
        title={t("settings.undoOne")}
        aria-label={t("settings.undoOne")}
        onClick={onUndo}
      >
        <UndoIcon size={13} />
      </button>
    </span>
  );
}
