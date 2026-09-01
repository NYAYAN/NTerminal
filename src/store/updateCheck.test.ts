// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Yeni sürüm denetimi.
 *
 * Uygulama kendini GÜNCELLEMİYOR, haber veriyor. Testlerin konusu üç ayrım:
 *
 * 1. "Yeni sürüm yok" ile "denetleyemedim" AYRI. Birleştirilirse ağı olmayan
 *    bir makinede "bu sürüm güncel" yazılır — bilmediğimiz bir şeyi biliyormuş
 *    gibi yapmak.
 * 2. Ayar yalnızca KENDİLİĞİNDEN yapılan denetimi kapatıyor; düğmeye basmak
 *    isteğin kendisi ve kapalıyken de çalışmalı.
 * 3. Denetim ASLA hata penceresi açmıyor: kullanıcının istediği bir şey
 *    değildi, bir kolaylık.
 */

const h = vi.hoisted(() => ({ checkUpdate: vi.fn(async () => null as unknown) }));

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    { checkUpdate: (...a: unknown[]) => h.checkUpdate(...(a as [])) } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("./useStore");

const YENI = { version: "0.2.0", url: "https://example/r/0.2.0", notes: "not" };

function seed(checkUpdates = true) {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    appVersion: "0.1.0",
    update: null,
    settings: {
      ...state.settings,
      behavior: { ...state.settings.behavior, checkUpdates },
    },
  });
}

beforeEach(() => {
  h.checkUpdate.mockReset();
  h.checkUpdate.mockResolvedValue(null);
  seed();
});

describe("sürüm denetimi", () => {
  it("yeni sürüm bulunca durumu dolduruyor", async () => {
    h.checkUpdate.mockResolvedValue(YENI);
    const ok = await useStore.getState().checkUpdate();

    expect(ok).toBe(true);
    expect(useStore.getState().update).toEqual(YENI);
    // Karşılaştırma Rust tarafında: arayüz kendi sürümünü gönderiyor, o kadar.
    expect(h.checkUpdate).toHaveBeenCalledWith("0.1.0");
  });

  it("yenisi yoksa durum boş kalıyor", async () => {
    const ok = await useStore.getState().checkUpdate();
    expect(ok).toBe(true);
    expect(useStore.getState().update).toBe(null);
  });

  it("denetim DÜŞERSE 'güncel' denmiyor", async () => {
    // `null` (yeni yok) ile hata AYRI: ikisi birleşirse ağı olmayan makinede
    // "bu sürüm güncel" yazılırdı.
    h.checkUpdate.mockRejectedValue(new Error("ağ yok"));
    const ok = await useStore.getState().checkUpdate();

    expect(ok, "hata başarı sayıldı").toBe(false);
    expect(useStore.getState().update).toBe(null);
  });

  it("hata penceresi açılmıyor", async () => {
    h.checkUpdate.mockRejectedValue(new Error("ağ yok"));
    await useStore.getState().checkUpdate();
    expect(useStore.getState().ui.toast, "kullanıcıya hata gösterildi").toBe(null);
  });

  it("ayar kapalıyken KENDİLİĞİNDEN denetlemiyor", async () => {
    // Ayarın tek işi bu: haber verilmeyen bir ağ isteği yapılmasın.
    seed(false);
    await useStore.getState().checkUpdate();
    expect(h.checkUpdate).not.toHaveBeenCalled();
  });

  it("ayar kapalı olsa da ELLE denetleniyor", async () => {
    // Düğmeye basmak isteğin kendisi; ayar yalnızca otomatiği kapatıyor.
    seed(false);
    h.checkUpdate.mockResolvedValue(YENI);
    const ok = await useStore.getState().checkUpdate(true);

    expect(ok).toBe(true);
    expect(useStore.getState().update).toEqual(YENI);
  });

  it("ikinci denetim eski haberi temizliyor", async () => {
    // Kullanıcı güncellemeyi kurup uygulamayı yeniden açmadıysa rozet
    // asılı kalmamalı.
    useStore.setState({ update: YENI });
    await useStore.getState().checkUpdate(true);
    expect(useStore.getState().update).toBe(null);
  });

  it("sürüm bilinmiyorken istek yapılmıyor", async () => {
    // Açılış tamamlanmadan `appVersion` boş; boş sürümle karşılaştırma
    // anlamsız bir sonuç üretirdi.
    useStore.setState({ appVersion: "" });
    const ok = await useStore.getState().checkUpdate(true);

    expect(ok).toBe(false);
    expect(h.checkUpdate).not.toHaveBeenCalled();
  });
});
