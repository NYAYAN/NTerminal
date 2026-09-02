/**
 * Node sürüm seçicinin saf kuralları: hangi satır ne komut üretiyor, arama
 * neyi süzüyor. Dal seçicideki `branches.ts` ile aynı düzen.
 */

import type { NodeEnv } from "../types";

/**
 * Seçilen sürüme geçiş komutu.
 *
 * nvm-windows: düz `nvm use 24.11.1`. Geçiş makine genelinde: yönetici tek
 * bir sembolik bağı değiştiriyor ve açık bütün kabuklar bunu görüyor.
 *
 * nvm.sh: `nvm use` yalnızca O KABUKTA geçerli ve yeni açılan sekme eski
 * sürümle geliyor — rozet de (varsayılanı okuduğu için) değişmezdi. Bir
 * seçiciden "sürüm değiştir" demek kalıcı bir seçim; o yüzden varsayılan da
 * birlikte değişiyor. İki komut bir satırda ki geçmişte ne yapıldığı okunsun.
 */
export function useNodeCommand(manager: NodeEnv["manager"], version: string): string {
  return manager === "nvm"
    ? `nvm alias default ${version} && nvm use ${version}`
    : `nvm use ${version}`;
}

/**
 * Listeyi arama metnine göre süzer — İÇEREN eşleşme, baştaki `v` yok
 * sayılıyor: "v24" yazan da "24" yazan da aynı satırları görmeli.
 */
export function filterVersions(list: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase().replace(/^v/, "");
  if (!q) return [...list];
  return list.filter((v) => v.includes(q));
}
