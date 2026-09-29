/**
 * Stash penceresinin saf kuralları: hangi dosyalar seçili, git'e hangi yollar
 * gidiyor, takipsiz dosya var mı.
 *
 * Arayüzden ayrı tutuluyor: hepsi porcelain durumundan ve seçimden türeyen
 * KARARLAR ve yanlış birinde sessizce yanlış dosya stash'e gider.
 */

import type { GitChange } from "../types";
import { stageState } from "./gitStage";

/** Değişen HER dosya: "Tüm dosyaları seç" kutusunun seçtiği küme. */
export function allChangePaths(changes: readonly GitChange[]): Set<string> {
  return new Set(changes.map((c) => c.path));
}

/**
 * Pencere açılırken seçili gelen yollar: "Değişiklikler" listesinde ŞU AN işaretli
 * olan dosyalar.
 *
 * İstek: "Değişiklikler listesinde neler seçiliyse Stash'a bastığımda onlar seçili
 * gelsin, kişi isterse değiştirsin." Listedeki kutu "commit'e ekle" demek, yani
 * seçim = indekste bir şeyi olan dosyalar (`stageState` `none` değil).
 *
 * KISMEN eklenmiş dosya (`MM`) da seçili: kutusu yarım işaretli ve stash dosya
 * düzeyinde çalışıyor; yarım kutu "bu dosyayla ilgileniyorum" diyor. Bunun
 * bedeli, dosyanın eklenmemiş kısmının da stash'e girmesi; kullanıcı pencerede
 * görüyor ve çıkarabiliyor.
 *
 * Hiçbir kutu işaretli değilse seçim BOŞ: pencere "hepsini al" diye varsaymıyor.
 * İlk Enter ile her şeyi yanlışlıkla kenara atmak, boş bir seçimin bir tık
 * ("Tüm dosyaları seç") maliyetinden pahalı.
 */
export function initialSelection(changes: readonly GitChange[]): Set<string> {
  return new Set(changes.filter((c) => stageState(c.status) !== "none").map((c) => c.path));
}

/**
 * Git'e gidecek yollar: seçili satırlar; yeniden adlandırmada ESKİ ad da.
 *
 * Sıra listenin sırası (seçim kümesinin ekleme sırası değil): kullanıcı bir
 * dosyayı bırakıp geri seçtiğinde gönderilen komut değişmesin.
 *
 * Eski ad neden gerekli: yalnızca yeni adı stash'lemek eski adın "silindi"
 * kaydını indekste bırakıyor ve dosya yarı taşınmış kalıyor (Rust tarafında
 * ölçüldü, bkz. `git.rs` `stash_push`). İndekste olmayan eski adı git'e
 * kabul ettirmek de Rust'ın işi.
 */
export function stashPaths(changes: readonly GitChange[], selected: ReadonlySet<string>): string[] {
  return changes
    .filter((c) => selected.has(c.path))
    .flatMap((c) => (c.origPath ? [c.origPath, c.path] : [c.path]));
}

/**
 * Seçimde takipsiz (`??`) dosya var mı.
 *
 * Varsa `--include-untracked` şart: git onsuz "pathspec did not match any
 * file(s) known to git" diyor (ölçüldü). Kullanıcıya ayrıca bir kutu
 * sormuyoruz: takipsiz bir dosyayı seçmek onu stash'e almak istemek demek.
 */
export function needsUntracked(changes: readonly GitChange[], selected: ReadonlySet<string>): boolean {
  return changes.some((c) => selected.has(c.path) && c.status.trim() === "??");
}

/** Toplu kutunun hâli: hepsi, bir kısmı ya da hiçbiri seçili. */
export type SelectionState = "all" | "some" | "none";

export function selectionState(
  changes: readonly GitChange[],
  selected: ReadonlySet<string>,
): SelectionState {
  const picked = changes.filter((c) => selected.has(c.path)).length;
  if (picked === 0) return "none";
  return picked === changes.length ? "all" : "some";
}

/**
 * Toplu kutuya basınca yeni seçim: hepsi seçiliyse hiçbiri, değilse (kısmen dâhil)
 * hepsi. "Kısmen"de hepsini seçmek doğru yön: kutuya basan kişi çoğu zaman
 * "hepsini al" diyor, geri almak için ikinci basış var.
 */
export function toggleAll(
  changes: readonly GitChange[],
  selected: ReadonlySet<string>,
): Set<string> {
  return selectionState(changes, selected) === "all" ? new Set() : allChangePaths(changes);
}

/** Bir satırın seçimini tersine çevirir; girdiyi DEĞİŞTİRMİYOR. */
export function toggleOne(selected: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(selected);
  if (!next.delete(path)) next.add(path);
  return next;
}

/**
 * Seçim listede artık olmayan yolları taşıyor mu — bunları ayıklar.
 *
 * Pencere açıkken git durumu tazelenebiliyor (bir dosya terminalden commit'lendi
 * ya da geri alındı). Listede olmayan bir yol seçili kalırsa git'e gider ve
 * "pathspec did not match" ile TÜM stash'i düşürür.
 */
export function pruneSelection(
  changes: readonly GitChange[],
  selected: ReadonlySet<string>,
): Set<string> {
  const present = new Set(changes.map((c) => c.path));
  return new Set([...selected].filter((p) => present.has(p)));
}

/** Kesilmiş dosya listesinde gösterilmeyen dosya sayısı. */
export function hiddenFileCount(total: number, shown: number): number {
  return Math.max(0, total - shown);
}
