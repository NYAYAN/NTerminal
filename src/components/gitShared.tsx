import { useT } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import {
  GitAddedIcon,
  GitDeletedIcon,
  GitModifiedIcon,
  GitRenamedIcon,
  GitUntrackedIcon,
} from "./Icons";

/*
 * Değişiklikler listesi, stash bölümü ve stash penceresinin ORTAK parçaları.
 *
 * Bu ikisi eskiden `GitChanges.tsx`in içindeydi. Stash bileşenleri de onlara
 * ihtiyaç duyunca, `GitChanges` da stash bölümünü çizdiği için iki dosya birbirini
 * içe aktarır olmuştu (döngüsel bağımlılık). Ortak kısım ayrı bir modüle taşındı;
 * iki taraf da bunu içe aktarıyor, birbirini değil.
 */

/**
 * Etkin sekmenin git durumu.
 *
 * AYRI bir kanca çünkü iki yer aynı gerçeği görmek zorunda: liste burası ve
 * panel başlığındaki toplu aç/kapa düğmesi (`SidePanel`). Türetmeyi iki kez
 * yazmak, ikisinin farklı dosya listesine bakabileceği bir yol açardı —
 * düğme "hepsi kapalı" derken listede açık satır kalması gibi.
 */
export function useActiveGit() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const allGit = useStore((s) => s.gitInfo);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const cwd = tab ? (sessions.get(tab.id)?.cwd ?? tab.cwd) : null;
  const git = cwd ? (allGit[cwd] ?? null) : null;
  return { cwd, git, changes: git?.changes ?? [] };
}

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
