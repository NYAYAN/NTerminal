/**
 * Dal seçicinin saf kuralları: hangi satır ne komut üretiyor, arama neyi
 * süzüyor.
 */

import type { GitBranch } from "../types";

/**
 * Seçilen dala geçiş komutu.
 *
 * Yerel dal: düz `git checkout ad`.
 *
 * Yalnızca uzakta olan dal: `git checkout --track origin/ad`. Git'in
 * `git checkout ad` kısayolu da aynı şeyi yapıyor ama iki uzakta aynı ad
 * varsa "hangisi?" diye durduruyor; `--track` ile uzak açıkça söyleniyor ve
 * komut geçmişte "yerel dal oluşturdu" gerçeğini de anlatıyor.
 */
export function checkoutCommand(branch: GitBranch): string {
  return branch.remote
    ? `git checkout --track ${branch.remote}/${branch.name}`
    : `git checkout ${branch.name}`;
}

/**
 * Listeyi arama metnine göre süzer — dal adı ya da uzağın adı üzerinden.
 *
 * Büyük/küçük harf gözetmiyor, İÇEREN eşleşme: `feature/api-v2` için "api"
 * yazmak yetmeli. "origin" yazan kişi fetch ile yeni gelenleri arıyor.
 */
export function filterBranches(list: readonly GitBranch[], query: string): GitBranch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  return list.filter(
    (b) => b.name.toLowerCase().includes(q) || (b.remote ?? "").toLowerCase().includes(q),
  );
}

/**
 * Seçicideki bir satır.
 *
 * `remote-toggle` ile `remote-label` AYNI başlığın iki hâli ve ayrım işlev
 * taşıyor: biri basılabilir ve klavyeyle gezilebiliyor, öteki yalnızca bir
 * etiket. Ok tuşları etiketin üstüne inerse Enter'ın yapacağı bir şey yok —
 * bu yüzden `isNavigable` onu dışarıda bırakıyor.
 */
export type PickerRow =
  | { kind: "branch"; branch: GitBranch }
  | { kind: "remote-toggle"; count: number; open: boolean }
  | { kind: "remote-label"; count: number };

/** Ok tuşlarının uğradığı ve Enter'ın bir şey yaptığı satırlar. */
export function isNavigable(
  row: PickerRow,
): row is Exclude<PickerRow, { kind: "remote-label" }> {
  return row.kind !== "remote-label";
}

/**
 * Seçicide çizilecek satırlar, sırasıyla.
 *
 * ## Neden uzak dallar ayrı bir bölümde
 *
 * BİLDİRİLEN SORUN: "yerel dallarla uzak dallar karışık geliyor, karışıklığa
 * sebep oluyor." Uzak dallar `git fetch` ile gelenler ve bir depoda yerel
 * dallardan katbekat çok olabiliyor; hepsi tek listede olunca kullanıcının
 * her gün geçtiği birkaç yerel dal onların arasında kayboluyordu.
 *
 * Git araçlarının çoğu bu ikisini ayırıyor: JetBrains IDE'leri açılır
 * pencerede "Local" ve "Remote" gruplarını ayrı başlıklarla veriyor;
 * Sourcetree, GitKraken ve Fork yan çubukta dalları ve uzakları ayrı,
 * katlanabilir bölümlere koyuyor.
 *
 * ## Kurallar
 *
 * - Yerel dallar HER ZAMAN üstte, başlıksız: varsayılan aranan onlar.
 * - Uzak dal yoksa bölüm de yok: boş bir başlık gürültü.
 * - Bölüm varsayılan KAPALI; başlık uzak dal SAYISINI taşıyor. Sayı, açmadan
 *   "orada bir şey var mı, kaç tane" sorusunu yanıtlıyor.
 * - ARAMA bölümü katlamayı EZİYOR: uzak dallar zaten `git fetch` sonrası bir
 *   dalı bulmak için listeleniyor ve kapalı bir bölümün içindeki eşleşmeyi
 *   göstermemek, aramanın yalan söylemesi demek. Aramada başlık düz bir
 *   etiket, sayı da yalnızca EŞLEŞENLERİ sayıyor.
 * - Gösterilecek yerel dal yoksa (yalnızca uzak eşleşiyor ya da hiç yerel dal
 *   yok) bölüm yine açık ve düz: katlayacak başka bir şey olmadığı için
 *   kapatmanın anlamı yok.
 */
export function pickerRows(
  list: readonly GitBranch[],
  query: string,
  remotesOpen: boolean,
): PickerRow[] {
  const matches = filterBranches(list, query);
  const local = matches.filter((b) => !b.remote);
  const remote = matches.filter((b) => b.remote);

  const rows: PickerRow[] = local.map((branch) => ({ kind: "branch", branch }));
  if (remote.length === 0) return rows;

  const flat = query.trim() !== "" || local.length === 0;
  if (flat) {
    rows.push({ kind: "remote-label", count: remote.length });
  } else {
    rows.push({ kind: "remote-toggle", count: remote.length, open: remotesOpen });
    if (!remotesOpen) return rows;
  }
  for (const branch of remote) rows.push({ kind: "branch", branch });
  return rows;
}
