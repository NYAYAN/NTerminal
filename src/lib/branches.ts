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
