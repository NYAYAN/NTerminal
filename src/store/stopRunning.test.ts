// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Çalışan komutu Ctrl+C ile durdurma — İKİ BASIŞ.
 *
 * BİLDİRİLEN HATA: "Komut çalışıyor kısmındayken Ctrl+C ile durduramıyorum."
 * Doğruydu: komut başlayınca kutu kapanıp yerine şerit geliyor, odak
 * terminalin DIŞINDA kalıyor ve genel kopyalama dalı tuşu yutuyordu.
 *
 * NEDEN İKİ BASIŞ (kullanıcının isteği): aynı tuş kopyalama da demek —
 * Windows'ta her yerde, mac'te Cmd+C olarak. Tek basışta durdurmak,
 * kopyalamak isteyen kullanıcının komutunu keserdi.
 *
 * TERMİNALİN İÇİ HARİÇ: orada düz Ctrl+C kabuğun kendi tuşu ve tek basışta
 * gitmeli. Bir terminalde `ng serve`i durdurmak için iki kez basmak otuz
 * yıllık bir alışkanlığı bozardı. Bu ayrım aşağıda kaynaktan bağlanıyor.
 */

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, { get: () => async () => undefined }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { sessions, useStore } = await import("./useStore");

const sendKeys = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  sendKeys.mockClear();
  sessions.set("t1", { sendKeys } as never);
  useStore.setState({ stopArmed: null, inputSignals: {} });
});

afterEach(() => {
  vi.useRealTimers();
  sessions.delete("t1");
  useStore.setState({ stopArmed: null });
});

describe("durdurma silahı", () => {
  it("silahlanıyor", () => {
    useStore.getState().armStop("t1");
    expect(useStore.getState().stopArmed).toBe("t1");
    // İlk basış HİÇBİR ŞEY göndermiyor: kopyalamak isteyenin komutu kesilmesin.
    expect(sendKeys).not.toHaveBeenCalled();
  });

  it("ikinci basış SIGINT gönderiyor", () => {
    useStore.getState().armStop("t1");
    useStore.getState().stopRunning("t1");
    expect(sendKeys).toHaveBeenCalledWith("\x03");
    expect(useStore.getState().stopArmed, "silah açık kaldı").toBe(null);
  });

  it("silah kendiliğinden düşüyor", () => {
    // Yarım kalmış bir niyet saatler sonra beklenmedik bir durdurmaya
    // dönüşmemeli: dakikalar sonra kopyalamak için basılan Ctrl+C komutu
    // keserdi.
    useStore.getState().armStop("t1");
    vi.advanceTimersByTime(5000);
    expect(useStore.getState().stopArmed).toBe(null);
  });

  it("şerit görünmüyorsa balonla haber veriliyor", () => {
    // Şerit yalnızca entegrasyonlu ve tam ekran olmayan sekmede çiziliyor.
    // Onun dışında ilk basış tümüyle sessiz kalırdı.
    useStore.setState({ inputSignals: { t1: { atPrompt: false, altScreen: true, integration: true } } });
    useStore.getState().armStop("t1");
    expect(useStore.getState().ui.toast?.text).toContain("tekrar basın");
  });

  it("şerit görünüyorsa balon YOK", () => {
    // İki ayrı yerde aynı cümle gürültü; şerit zaten bakılan yer.
    useStore.setState({
      ui: { ...useStore.getState().ui, toast: null },
      inputSignals: { t1: { atPrompt: false, altScreen: false, integration: true } },
    });
    useStore.getState().armStop("t1");
    expect(useStore.getState().ui.toast).toBe(null);
  });
});

describe("kaynaktaki kural", () => {
  const APP = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

  it("terminaldeki düz Ctrl+C dışarıda bırakılıyor", () => {
    // Bu satır gitse `ng serve` terminalde de iki basış isterdi.
    expect(APP, "kabuğun kendi tuşu için ayrım yok").toMatch(
      /shellCtrlC\s*=\s*inTerminal && event\.ctrlKey/,
    );
    expect(APP, "ayrım koşulda kullanılmıyor").toContain("!shellCtrlC");
  });

  it("durdurma ancak SİLAHLIYKEN gerçekleşiyor", () => {
    // `stopArmed` kontrolü düşerse ilk basış komutu keser ve kopyalama
    // yapmak isteyen kullanıcı çalışan işini kaybeder.
    expect(APP).toMatch(/store\.stopArmed === runningTab\.tab\.id/);
    expect(APP).toContain("store.armStop(");
  });

  it("kopyalanacak bir şey varken kopyalama kazanıyor", () => {
    expect(APP).toMatch(/copyWins\s*=\s*matchCombo\(event, keys\.copy\) && !!session\?\.hasSelection\(\)/);
  });
});
