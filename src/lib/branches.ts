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
 * Bir bölümde çizilen en fazla dal satırı; kalanı tek bir "N dal daha" satırı.
 *
 * ÖLÇÜLDÜ (10 bin uzak dal, üretim derlemesi, Chromium): bölümü açmak 510 ms,
 * aramada ilk harf 402 ms, her ok tuşu ve fareyle satır değiştirmek ~50 ms
 * sürüyordu; listede 90 bin DOM öğesi vardı. Süzme 0,6 ms'ydi, bedel çizimde.
 * Panel bir seferde ~12 satır gösteriyor: 200. satıra kaydıran yok, arayan var.
 * Tavanla aynı işler 10 bin dalda 5 / 6 / 0,7 ms, 50 bin dalda 6 / 10 / 0,8 ms.
 */
export const SECTION_ROW_LIMIT = 200;

/**
 * Uzak dallar bu süre içinde gelirse seçici TEK SEFERDE çiziliyor; gelmezse
 * önce yerel dallar, uzaklar arkadan.
 *
 * Neden iki okuma: yerel dallar uzak dal sayısından bağımsız. ÖLÇÜLDÜ (50 bin
 * uzak dal): yalnızca yereller 29-56 ms, tam liste 634 ms (paketli ref) ile
 * 8 sn (`git fetch` sonrası, her ref ayrı dosya). Tam listeyi beklemek, her gün
 * geçilen birkaç yerel dal için saniyelerce "Yükleniyor…" demekti.
 *
 * Neden bekleme süresi: iki aşamalı çizimin bir bedeli var — başlık bir kare
 * "…" gösterip sayıya dönüyor, uzak dalı olmayan depoda bir an görünüp
 * kayboluyor ve panel rozetin üstünde zıplıyor. Çoğu depoda iki okuma da bu
 * sürenin içinde (2 bin uzak dal 22-66 ms, 10 bin paketli 51 ms); iki aşama
 * yalnızca gerçekten yavaş depoda devreye giriyor (10 bin gevşek ref 356 ms).
 */
export const REMOTES_GRACE_MS = 150;

/**
 * Seçicideki bir satır.
 *
 * `remote-toggle` ile `remote-label` AYNI başlığın iki hâli ve ayrım işlev
 * taşıyor: biri basılabilir ve klavyeyle gezilebiliyor, öteki yalnızca bir
 * etiket. Ok tuşları etiketin üstüne inerse Enter'ın yapacağı bir şey yok —
 * bu yüzden `isNavigable` onu dışarıda bırakıyor. Başlığın üçüncü hâli
 * `remote-pending`: uzaklar henüz okunuyor, sayı bilinmiyor. `more` de
 * gezilmiyor: çizilmeyen dalları SAYIYOR, kendisi bir dal değil. `remote` hangi
 * bölümün sonunda durduğunu söylüyor (uzak satırlar girintili çiziliyor).
 */
export type PickerRow =
  | { kind: "branch"; branch: GitBranch }
  | { kind: "remote-toggle"; count: number; open: boolean }
  | { kind: "remote-label"; count: number }
  | { kind: "remote-pending" }
  | { kind: "more"; hidden: number; remote: boolean };

/**
 * Ok tuşlarının uğradığı ve Enter'ın bir şey yaptığı satırlar: dallar ve
 * basılabilir başlık. Olumlu yazılı: yeni bir etiket türü kendiliğinden
 * gezilemez kalıyor.
 */
export function isNavigable(
  row: PickerRow,
): row is Extract<PickerRow, { kind: "branch" } | { kind: "remote-toggle" }> {
  return row.kind === "branch" || row.kind === "remote-toggle";
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
 * - Her bölüm en fazla `SECTION_ROW_LIMIT` dal çiziyor; kalanı bölümün
 *   sonundaki tek bir `more` satırı sayıyor. Başlıktaki sayı yine TAMAMI:
 *   tavan aramanın bulduğunu değil, yalnızca çizileni küçültüyor. Sıra
 *   Rust'tan en son commit'e göre geliyor, yani çizilenler en taze dallar.
 * - Uzaklar henüz okunuyorsa (`remotesPending`, bkz. `REMOTES_GRACE_MS`)
 *   bölümün yerinde sayısız, basılamayan bir etiket duruyor — aramada da.
 *   Boş bir arama sonucu "uzakta yok" demek değil: henüz bilmiyoruz.
 *   Okunurken listedeki uzak girdiler yok sayılıyor: `remotes`'u tanımayan
 *   eski bir ikili (arayüz HMR'la yenilenip Rust yeniden başlatılmamışsa)
 *   yerel çağrıya da her şeyi dönüyor.
 */
export function pickerRows(
  list: readonly GitBranch[],
  query: string,
  remotesOpen: boolean,
  remotesPending = false,
): PickerRow[] {
  const matches = filterBranches(list, query);
  const local = matches.filter((b) => !b.remote);
  const remote = matches.filter((b) => b.remote);

  const rows: PickerRow[] = [];
  pushCapped(rows, local, false);
  if (remotesPending) {
    rows.push({ kind: "remote-pending" });
    return rows;
  }
  if (remote.length === 0) return rows;

  const flat = query.trim() !== "" || local.length === 0;
  if (flat) {
    rows.push({ kind: "remote-label", count: remote.length });
  } else {
    rows.push({ kind: "remote-toggle", count: remote.length, open: remotesOpen });
    if (!remotesOpen) return rows;
  }
  pushCapped(rows, remote, true);
  return rows;
}

/** Bölümün dallarını tavana kadar ekler; artan varsa ardına tek bir `more` satırı. */
function pushCapped(rows: PickerRow[], branches: readonly GitBranch[], remote: boolean) {
  for (const branch of branches.slice(0, SECTION_ROW_LIMIT)) rows.push({ kind: "branch", branch });
  const hidden = branches.length - SECTION_ROW_LIMIT;
  if (hidden > 0) rows.push({ kind: "more", hidden, remote });
}
