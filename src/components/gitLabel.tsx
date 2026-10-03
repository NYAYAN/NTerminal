import { useT } from "../lib/i18n";
import {
  GitAddedIcon,
  GitDeletedIcon,
  GitModifiedIcon,
  GitRenamedIcon,
  GitUntrackedIcon,
} from "./Icons";

/**
 * Durum harflerinin okunabilir karşılığı.
 *
 * Porcelain iki karakter veriyor: ilki indeks, ikincisi çalışma ağacı. `??`
 * takip edilmeyen. Bileşik durumlarda (`AM`) İNDEKS harfi belirleyici, çünkü
 * commit'e girecek olan o.
 *
 * ## Renkler VS Code / GitHub yerleşiği
 *
 * Yeni, takip edilmeyen ve yeniden adlandırılan YEŞİL; değiştirilen SARI;
 * silinen KIRMIZI. Kullanıcının her gün baktığı kaynak denetimi listesi bu
 * dili konuşuyor ve iki yüzey arasında renk çevirmek zorunda kalmamalı.
 *
 * `git status`un KENDİ renkleri (sahnelenen yeşil, sahnelenmeyen her şey
 * kırmızı) bilinçli olarak alınmadı: o şema "ne tür değişiklik" değil
 * "sahnelendi mi" eksenli, yani takip edilmeyeni değiştirilenle aynı kırmızıya
 * indiriyor — bu listenin sorduğu soru o değil.
 *
 * ## Neden yazı değil simge
 *
 * Etiket ("DEĞİŞTİ", "YENİDEN ADLANDIRILDI") sabit 88px'lik bir sütun
 * tutuyordu ve o sütun dosya YOLUNDAN çalınmıştı: panel dar olduğunda asıl
 * aranan bilgi kırpılıyor, her satırda tekrarlanan aynı beş kelimeden biri
 * yerinde duruyordu. Durum listede zaten renkle kodlanmış; simge o rengi
 * taşıyor, tam metin ipucunda ve ekran okuyucuda kalıyor — yani hiçbir bilgi
 * kaybolmuyor, yalnızca yerini bırakıyor.
 */
type StatusLook = {
  text: string;
  tone: string;
  Icon: (props: { size?: number; className?: string }) => React.ReactElement;
};

/** Durum harflerinin simgesi, rengi ve metni; stash satırları da aynı dili kullanıyor. */
export function useLabel(status: string): StatusLook {
  const t = useT();
  const trimmed = status.trim();
  if (trimmed === "??")
    return { text: t("git.untracked"), tone: "untracked", Icon: GitUntrackedIcon };
  const kod = trimmed[0] ?? "";
  if (kod === "A") return { text: t("git.added"), tone: "new", Icon: GitAddedIcon };
  if (kod === "D") return { text: t("git.deleted"), tone: "del", Icon: GitDeletedIcon };
  if (kod === "R") return { text: t("git.renamed"), tone: "ren", Icon: GitRenamedIcon };
  return { text: t("git.modified"), tone: "mod", Icon: GitModifiedIcon };
}
