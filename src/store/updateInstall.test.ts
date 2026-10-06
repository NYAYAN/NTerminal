// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConfirmRequest } from "./useStore";

/**
 * Uygulama içinden güncelleme: "Güncelle ve yeniden başlat".
 *
 * Yanlış çalışmasının bedeli diğer düğmelerden ağır: yeniden başlatma
 * sekmelerdeki kabukları kapatıyor. Testlerin konusu dört ayrım:
 *
 * 1. Onay SORULUYOR ve çalışan komut varsa bunu söylüyor — `ng serve`
 *    çalışırken habersiz yeniden başlatmak kullanıcının sunucusunu öldürmek.
 * 2. Sıra: indir → durumu diske yaz → kur. Durum indirmeden ÖNCE yazılsaydı
 *    indirme süresince üretilen çıktı yeniden açılışta kaybolurdu.
 * 3. İndirme düşerse kurulum YAPILMIYOR ve hata gösteriliyor: kullanıcının
 *    bastığı bir düğme, denetimin aksine sessiz kalamaz.
 * 4. Kurulamayan yayında (`installable: false`) düğmenin eylemi hiçbir şey
 *    yapmıyor — indirme sayfası tek yol.
 */

const h = vi.hoisted(() => ({
  calls: [] as string[],
  progress: [] as { received: number; total: number | null }[],
  downloadUpdate: vi.fn(),
  applyUpdate: vi.fn(),
  saveWorkspace: vi.fn(),
}));

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      downloadUpdate: (cb: (p: { received: number; total: number | null }) => void) =>
        h.downloadUpdate(cb),
      applyUpdate: () => h.applyUpdate(),
      saveWorkspace: (w: unknown) => h.saveWorkspace(w),
    } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("./useStore");

const KURULUR = { version: "0.3.0", url: "https://example/r/0.3.0", notes: "", installable: true };

let asked: ConfirmRequest[] = [];
let answer = true;

function seed(update = KURULUR) {
  useStore.setState({
    ready: true,
    bootError: null,
    appVersion: "0.2.1",
    update,
    updateInstall: { phase: "idle" },
    running: {},
    askConfirm: async (request) => {
      asked.push({ ...request, id: asked.length + 1 });
      return answer;
    },
    ui: { ...useStore.getState().ui, toast: null },
  });
}

beforeEach(() => {
  h.calls = [];
  h.progress = [];
  asked = [];
  answer = true;
  h.downloadUpdate.mockReset();
  h.downloadUpdate.mockImplementation(async (cb: (p: { received: number; total: number | null }) => void) => {
    h.calls.push("indir");
    cb({ received: 50, total: 100 });
    h.progress.push(useStore.getState().updateInstall as never);
    return "0.3.0";
  });
  h.applyUpdate.mockReset();
  h.applyUpdate.mockImplementation(async () => {
    h.calls.push("kur");
  });
  h.saveWorkspace.mockReset();
  h.saveWorkspace.mockImplementation(async () => {
    h.calls.push("kaydet");
  });
  seed();
});

describe("uygulama içinden güncelleme", () => {
  it("sıra: onay → indir → durumu yaz → kur", async () => {
    await useStore.getState().installUpdate();

    expect(asked, "onay sorulmadı").toHaveLength(1);
    expect(h.calls).toEqual(["indir", "kaydet", "kur"]);
    expect(useStore.getState().updateInstall.phase).toBe("restarting");
  });

  it("onay penceresi sürümü ve yeniden başlatmayı söylüyor", async () => {
    await useStore.getState().installUpdate();
    const [request] = asked;
    expect(request.message).toContain("0.3.0");
    expect(request.message).toContain("yeniden başlatılacak");
    // Komut çalışmıyorken uyarı değil, bilgi.
    expect(request.danger).toBeFalsy();
  });

  it("çalışan komut varsa onay bunu söylüyor ve tehlike olarak işaretli", async () => {
    useStore.setState({ running: { t1: true, t2: true, t3: false } });
    await useStore.getState().installUpdate();
    const [request] = asked;
    expect(request.detail).toContain("2 sekmede");
    expect(request.danger).toBe(true);
  });

  it("vazgeçilirse hiçbir şey indirilmiyor", async () => {
    answer = false;
    await useStore.getState().installUpdate();
    expect(h.calls).toEqual([]);
    expect(useStore.getState().updateInstall).toEqual({ phase: "idle" });
  });

  it("indirme ilerlemesi durumu dolduruyor", async () => {
    await useStore.getState().installUpdate();
    expect(h.progress).toEqual([{ phase: "downloading", received: 50, total: 100 }]);
  });

  it("indirme düşerse kurulmuyor ve hata gösteriliyor", async () => {
    h.downloadUpdate.mockRejectedValue("imza doğrulanamadı");
    await useStore.getState().installUpdate();

    expect(h.applyUpdate, "doğrulanmamış paket kuruldu").not.toHaveBeenCalled();
    expect(h.saveWorkspace).not.toHaveBeenCalled();
    expect(useStore.getState().updateInstall).toEqual({
      phase: "failed",
      error: "imza doğrulanamadı",
    });
    expect(useStore.getState().ui.toast?.tone).toBe("err");
  });

  it("kurulum düşerse hata gösteriliyor ve yeniden denenebiliyor", async () => {
    h.applyUpdate.mockRejectedValueOnce("izin yok");
    await useStore.getState().installUpdate();
    expect(useStore.getState().updateInstall.phase).toBe("failed");

    await useStore.getState().installUpdate();
    expect(h.applyUpdate).toHaveBeenCalledTimes(2);
  });

  it("sürerken ikinci basış ikinci indirme başlatmıyor", async () => {
    let finish: () => void = () => {};
    h.downloadUpdate.mockImplementation(
      () => new Promise<string>((resolve) => (finish = () => resolve("0.3.0"))),
    );
    const first = useStore.getState().installUpdate();
    await vi.waitFor(() => expect(h.downloadUpdate).toHaveBeenCalledTimes(1));

    await useStore.getState().installUpdate();
    expect(h.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(asked, "ikinci basış yine onay sordu").toHaveLength(1);

    finish();
    await first;
  });

  it("kurulamayan yayında hiçbir şey yapmıyor", async () => {
    // İmzasız yayın ya da kurulu olmayan kopya: tek yol indirme sayfası.
    seed({ ...KURULUR, installable: false });
    await useStore.getState().installUpdate();
    expect(asked).toEqual([]);
    expect(h.downloadUpdate).not.toHaveBeenCalled();
  });
});
