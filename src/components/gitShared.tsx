import { sessions, useStore } from "../store/useStore";

/*
 * Durum simgesi ve metni (`useLabel`) AYRI bir modülde: fark penceresi de
 * kullanıyor ve bu dosya depoyu içe aktarıyor — fark penceresi ana arayüzün
 * deposunu, terminal oturumlarını hiç yüklememeli (bkz. `main.tsx`).
 */
export { useLabel } from "./gitLabel";

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

