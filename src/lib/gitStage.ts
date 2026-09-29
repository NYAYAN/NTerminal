/**
 * Değişiklikler panelinde commit ve push'un saf kuralları: bir dosyanın commit'e
 * girip girmediği, toplu seçim, gönderme planı.
 *
 * Arayüzden ayrı tutuluyor çünkü hepsi porcelain harflerinden ve `GitInfo`
 * alanlarından türeyen KARARLAR; bileşenler yalnızca çiziyor. Kararlar burada
 * gerçek durum harfleriyle sınanıyor.
 */

import type { GitChange, GitInfo } from "../types";

/**
 * Bir dosyanın commit'e girme durumu — satırdaki kutunun üç hâli.
 *
 * - `none`: indekste bu dosyadan bir şey yok (`" M"`, `" D"`, `"??"`); commit'e
 *   girmez. Çakışmalar da burada: çözülene kadar git commit'i reddediyor.
 * - `staged`: dosyanın TÜM değişikliği indekste (`"M "`, `"A "`, `"D "`, `"R "`).
 * - `partial`: indekste bir kısmı var, ağaçta daha fazlası (`"MM"`, `"AM"`).
 *   Commit'e yalnızca indeksteki kısım girer; kutu bunu "kısmen" göstererek
 *   söylüyor, yoksa kullanıcı düzenlemesinin tamamının gittiğini sanırdı.
 */
export type StageState = "none" | "partial" | "staged";

/** Çakışma durumları: iki taraf da bir şey yapmış, çözüm bekliyor. */
export function isUnmerged(status: string): boolean {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(status);
}

/** Porcelain'in iki harfi → dosyanın indeks durumu. */
export function stageState(status: string): StageState {
  if (status === "??" || isUnmerged(status)) return "none";
  // Birinci harf İNDEKS tarafı, ikincisi çalışma ağacı.
  const index = status[0] ?? " ";
  const tree = status[1] ?? " ";
  if (index === " ") return "none";
  return tree === " " ? "staged" : "partial";
}

/**
 * Farkın İÇERİĞİNİ belirleyen durum sınıfı; sahnelemeden bağımsız.
 *
 * `M ` ile ` M` aynı dosyanın aynı değişikliği: fark HEAD'e karşı alınıyor
 * (bkz. `git.rs` `diff`), yani kutuya basmak farkı değiştirmiyor. Satırın fark
 * isteği ham durum yerine bu sınıfa bağlı ki kutuya her basışta `git diff`
 * yeniden koşmasın — sınıf yalnızca fark GERÇEKTEN başka bir yoldan alınacaksa
 * değişiyor (takipsiz dosya `--no-index` ile geliyor).
 */
export type DiffKind = "untracked" | "deleted" | "added" | "renamed" | "modified";

export function diffKind(status: string): DiffKind {
  if (status.trim() === "??") return "untracked";
  const index = status[0] ?? " ";
  const tree = status[1] ?? " ";
  if (index === "D" || tree === "D") return "deleted";
  if (index === "R" || index === "C") return "renamed";
  if (index === "A") return "added";
  return "modified";
}

/**
 * İndeksten çıkarılacak yollar: yeniden adlandırmada ESKİ ad da.
 *
 * Yalnızca yeni adı çıkarmak eski adın "silindi" kaydını indekste bırakıyor
 * (Rust tarafında ölçüldü): kutuyu kaldıran kullanıcının commit'ine bir silme
 * girmeye devam ederdi.
 */
export function unstagePaths(changes: readonly GitChange[]): string[] {
  return changes.flatMap((c) => (c.origPath ? [c.origPath, c.path] : [c.path]));
}

/**
 * Sahnelenecek yollar: henüz TAM sahnelenmemiş satırlar.
 *
 * Kısmen sahnelenmiş dosya da dâhil: yeniden eklemek geri kalan düzenlemeleri
 * de indekse alıyor, yani kutunun "seç" demesi dosyanın tamamını seçiyor.
 */
export function stagePaths(changes: readonly GitChange[]): string[] {
  return changes.filter((c) => stageState(c.status) !== "staged").map((c) => c.path);
}

export interface StageSummary {
  total: number;
  /** En az bir kısmı indekste olan satır sayısı. */
  any: number;
  /** Başlıktaki toplu kutunun hâli. */
  state: StageState;
}

/**
 * Başlıktaki toplu kutunun durumu.
 *
 * Hepsi tam sahnelenmişse `staged`, hiçbirinde indeks yoksa `none`, gerisi
 * `partial`. Boş listede `none`: seçilecek bir şey olmadığı için "hepsi
 * seçili" demek yanlış olurdu.
 */
export function stageSummary(changes: readonly GitChange[]): StageSummary {
  let full = 0;
  let any = 0;
  for (const c of changes) {
    const state = stageState(c.status);
    if (state === "staged") full += 1;
    if (state !== "none") any += 1;
  }
  const total = changes.length;
  const state: StageState = total > 0 && full === total ? "staged" : any === 0 ? "none" : "partial";
  return { total, any, state };
}

/** Commit düğmesi neden kapalı; hazırsa `null`. */
export type CommitBlock = "noFiles" | "noMessage" | null;

/**
 * Commit atılabilir mi.
 *
 * Önce dosya, sonra ileti: "önce ne yapmalıyım" sorusunun yanıtı sırayla
 * gidiyor ve ipucu ilk eksik olanı söylüyor. `staged` Rust'tan gelen KESİLMEMİŞ
 * sayı, listenin görünen satırlarından sayılmıyor.
 */
export function commitBlock(staged: number, message: string): CommitBlock {
  if (staged <= 0) return "noFiles";
  if (message.trim() === "") return "noMessage";
  return null;
}

/**
 * Gönder düğmesinin ne yapacağı.
 *
 * - `detached`: HEAD bir dala bağlı değil, gönderilecek dal yok.
 * - `publish`: yukarı akış yok (yeni dal ya da silinmiş uzak); dal uzakta
 *   oluşturulup izleme kurulur.
 * - `push`: yukarı akış var ve ileride commit var.
 * - `none`: gönderilecek bir şey yok. Hiç commit atılmamış depo da burada:
 *   "yayınla" demek boş bir depoda yalnızca hata üretirdi.
 */
export type PushPlan =
  | { kind: "none" }
  | { kind: "detached" }
  | { kind: "publish" }
  | { kind: "push"; ahead: number; behind: number; upstream: string };

export function pushPlan(git: GitInfo): PushPlan {
  if (git.unborn) return { kind: "none" };
  if (git.detached) return { kind: "detached" };
  if (!git.upstream) return { kind: "publish" };
  if (git.ahead > 0) {
    return { kind: "push", ahead: git.ahead, behind: git.behind, upstream: git.upstream };
  }
  return { kind: "none" };
}
