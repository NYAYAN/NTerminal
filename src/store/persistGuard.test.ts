import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/ipc";
import { flushAllState, useStore } from "./useStore";

/**
 * Açılış tamamlanmadan düzen diske YAZILMAZ.
 *
 * ÖLÇÜLEN VERİ KAYBI. Geliştirme kipinde Vite modülleri sıcak değiştirdiğinde
 * depo yeni ve boş bir örnekle kuruluyor (`groups: []`) ve `bootstrap()` henüz
 * koşmamış oluyor. O aralıkta bir kaydetme tetiklendi ve diskteki
 * `workspace.json` dokuz sekmelik düzenin yerine boş bir dosyayla değiştirildi.
 * Kullanıcının dört grubu ancak Rust tarafındaki yedek (`snapshot_if_shrinking`)
 * sayesinde geri geldi.
 *
 * Sıcak değiştirme yalnızca tetikleyiciydi; kural genel: açılıştan ÖNCEKİ boş
 * durum "kaydedilecek bir şey" değil, "henüz okunmamış" demek. Aynısı açılışın
 * düştüğü durum için de geçerli — orada diskteki düzeni ezmek son sağlam
 * kopyayı yok etmek olurdu.
 */

const HAZIR = { ready: true, bootError: null } as const;

afterEach(() => {
  vi.restoreAllMocks();
  useStore.setState({ ready: false, bootError: null, groups: [], activeGroupId: null });
});

describe("düzen kaydetme kapısı", () => {
  it("açılış tamamlanmadan yazmıyor", async () => {
    const save = vi.spyOn(api, "saveWorkspace").mockResolvedValue(undefined);
    useStore.setState({ ready: false, bootError: null, groups: [], activeGroupId: null });

    await useStore.getState().persistNow();
    await flushAllState();

    expect(save, "açılıştan önce diske yazıldı — boş düzen kullanıcınınkini ezer").not
      .toHaveBeenCalled();
  });

  it("açılış düştüyse de yazmıyor", async () => {
    // Diskteki düzen o an son sağlam kopya; üstüne yazmak onu da götürür.
    const save = vi.spyOn(api, "saveWorkspace").mockResolvedValue(undefined);
    useStore.setState({ ready: true, bootError: "açılamadı", groups: [], activeGroupId: null });

    await useStore.getState().persistNow();
    await flushAllState();

    expect(save).not.toHaveBeenCalled();
  });

  it("açılış tamamlandıysa yazıyor", async () => {
    // Kapı bir kilit değil: normal işleyişte kaydetme çalışmaya devam etmeli,
    // yoksa test "hiç yazma" diyen bozuk bir uygulamayı da geçirirdi.
    const save = vi.spyOn(api, "saveWorkspace").mockResolvedValue(undefined);
    useStore.setState({ ...HAZIR, groups: [], activeGroupId: null });

    await useStore.getState().persistNow();

    expect(save).toHaveBeenCalledTimes(1);
  });
});
