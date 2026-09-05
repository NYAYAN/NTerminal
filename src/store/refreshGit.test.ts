import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/ipc";
import { useStore } from "./useStore";

/**
 * Dal rozetinin tazelenmesi — İKİ SORGU PARALEL.
 *
 * `gitInfo` dalı ve değişiklik listesini okuyor, `gitFingerprint` ise
 * `HEAD` + `index` damgasını. İkincisi birincinin sonucunu KULLANMIYOR, yani
 * sırayla beklemenin tek etkisi iki gecikmeyi toplamak.
 *
 * Bu doğrudan görünür bir şey: `cd` sonrası `gitInfo[yeni dizin]` boş olduğu
 * için dal ve `± n` rozetleri ekranda hiç yok; bekleme ne kadar sürerse
 * rozetler o kadar süre eksik kalıyor.
 *
 * Test SÜREYE bakmıyor (ölçüm makineye bağlı olurdu), ÇAĞRI SIRASINA bakıyor:
 * ikinci sorgu, birincisi çözülmeden başlamış olmalı.
 */

const CWD = "/depo";

afterEach(() => {
  vi.restoreAllMocks();
  useStore.setState({ gitInfo: {} });
});

describe("refreshGit", () => {
  it("iki sorgu paralel koşuyor", async () => {
    const olaylar: string[] = [];
    let infoyuBitir: (() => void) | null = null;

    vi.spyOn(api, "gitInfo").mockImplementation(async () => {
      olaylar.push("info:başladı");
      // Bilerek ASILI: sırayla koşan bir uygulamada damga sorgusu bu söz
      // çözülene kadar hiç başlayamaz.
      await new Promise<void>((resolve) => {
        infoyuBitir = resolve;
      });
      olaylar.push("info:bitti");
      return null;
    });
    vi.spyOn(api, "gitFingerprint").mockImplementation(async () => {
      olaylar.push("damga:başladı");
      return "abc";
    });

    const is = useStore.getState().refreshGit(CWD);
    // Bir tur bekle: paralelse damga sorgusu çoktan başlamış olmalı.
    await Promise.resolve();
    await Promise.resolve();

    expect(olaylar, "damga sorgusu `gitInfo`u bekliyor — sıralı koşuyorlar").toEqual([
      "info:başladı",
      "damga:başladı",
    ]);

    infoyuBitir!();
    await is;
    expect(olaylar).toContain("info:bitti");
  });

  it("bir sorgu düşse de diğerinin sonucu yazılıyor", async () => {
    // `Promise.all` reddi yayar; her iki çağrının KENDİ `catch`i olması şart,
    // yoksa `git` bulunamayan bir makinede rozet hiç güncellenmez.
    vi.spyOn(api, "gitInfo").mockRejectedValue(new Error("git yok"));
    vi.spyOn(api, "gitFingerprint").mockRejectedValue(new Error("git yok"));

    await expect(useStore.getState().refreshGit(CWD)).resolves.toBeUndefined();
    expect(useStore.getState().gitInfo[CWD]).toBe(null);
  });

  it("dizin yoksa hiç sorgu yok", async () => {
    const info = vi.spyOn(api, "gitInfo");
    await useStore.getState().refreshGit(null);
    expect(info).not.toHaveBeenCalled();
  });
});
