// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shortenPath } from "../lib/format";
import { setLanguage } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { StatusBar } from "./StatusBar";

/**
 * Durum çubuğundaki "yolu kopyala" düğmesi.
 *
 * BİLDİRİLEN İSTEK: "bulunduğum path'i kopyala butonu ekleyelim", ardından
 * yeri kesinleşti: "kopyala ikonu alttaki komut yaz altındaki path sağına
 * gelsin."
 *
 * ## Neden ayrı bir düğme
 *
 * Yolun tıklaması ZATEN dolu: klasörü Gezgin'de açıyor. Kopyalamayı oraya
 * bindirmek (uzun basış, Ctrl+tık, çift tık) keşfedilmeyen bir eylem
 * üretirdi; bu depoda aynı karar `GitChanges` satır eylemlerinde de verildi ve
 * gerekçesi orada yazıyor.
 *
 * ## Neden TAM yol
 *
 * Çubuk yolu kısaltarak yazıyor (`…\Work\NTerminal`) çünkü yer yok.
 * Kopyalamanın tek anlamı ise başka bir yere yapıştırmak ve kısaltılmış bir
 * yol hiçbir yere yapıştırılamaz — testin asıl bağladığı şey bu ayrım.
 *
 * ## Neden başarısızlık da test ediliyor
 *
 * WebView2 pano yazmayı kullanıcı hareketine bağlıyor ve reddedebiliyor
 * ("Write permission denied", canlı uygulamada ölçüldü). Sessizce yutulan bir
 * ret, düğmeyi bozuk değil ÖLÜ gösteriyor.
 */

const TAB = "t1";
/** Kısaltmanın gerçekten iş yapması için üçten fazla parçalı bir yol. */
const CWD = "/home/ali/projeler/derin/klasor/nterminal";

/** Pano: jsdom'da yok. */
const writeText = vi.fn(async () => {});

function tab(locked: boolean): TabState {
  return {
    id: TAB,
    title: TAB,
    customTitle: null,
    profileId: "p1",
    cwd: CWD,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked,
  };
}

function group(tabs: TabState[]): Group {
  return {
    id: "g1",
    name: "g1",
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: TAB,
    tabs,
  };
}

function seed(locked = false) {
  useStore.setState({
    groups: [group([tab(locked)])],
    activeGroupId: "g1",
    ready: true,
  });
}

const copyBtn = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".copy-cwd");
const cwdItem = (c: HTMLElement) => c.querySelector<HTMLElement>(".statusbar .cwd");

beforeEach(() => {
  setLanguage("tr");
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  sessions.set(TAB, { cwd: CWD } as never);
  seed();
});

afterEach(() => {
  cleanup();
  sessions.delete(TAB);
  useStore.setState({ groups: [], activeGroupId: null, gitInfo: {} });
});

describe("bulunulan yolu kopyala", () => {
  it("düğme yolun HEMEN sağında", () => {
    /*
     * Yer bilinçli: istenen "path sağına gelsin". Test bunu DOM sırasıyla
     * bağlıyor, çünkü sağa koymanın tek yolu bu — CSS'te sıralamayla
     * (`order`) yapılsaydı ekranda doğru, kaynakta ve klavye gezinmesinde
     * yanlış bir sıra çıkardı.
     */
    const { container } = render(<StatusBar />);
    const btn = copyBtn(container);
    expect(btn, "kopyala düğmesi çubukta yok").not.toBe(null);
    expect(cwdItem(container)!.nextElementSibling, "düğme yolun yanında değil").toBe(btn);
    // İmleçle belirmiyor: gizli bir eylem, bir kez keşfedilene kadar yok
    // demek. Ekran okuyucu için de adı var — içinde metin taşımıyor.
    expect(btn!.getAttribute("aria-label")).toBe("Klasör yolunu kopyala");
  });

  it("panoya TAM yol gidiyor, çubuktaki kısaltma değil", async () => {
    const { container } = render(<StatusBar />);
    // Önce ekrandaki hâlin gerçekten kısaltılmış olduğunu bağlayalım, yoksa
    // test iki aynı dizeyi karşılaştırıp hiçbir şey kanıtlamaz.
    const ekranda = shortenPath(CWD, 3);
    expect(ekranda, "yol kısaltılmıyor: test bir şey kanıtlamıyor").not.toBe(CWD);
    expect(cwdItem(container)!.textContent).toContain(ekranda);

    await act(async () => {
      fireEvent.click(copyBtn(container)!);
    });

    expect(writeText).toHaveBeenCalledWith(CWD);
    expect(useStore.getState().ui.toast?.text).toBe("Yol kopyalandı");
  });

  it("pano reddederse söylüyor", async () => {
    // Ölçülen ret: WebView2 "Write permission denied" veriyor. Sessiz bir
    // başarısızlık düğmeyi ölü gösterir ve kullanıcı ikinci kez basar.
    writeText.mockRejectedValueOnce(new Error("Write permission denied"));
    const { container } = render(<StatusBar />);

    await act(async () => {
      fireEvent.click(copyBtn(container)!);
    });

    const toast = useStore.getState().ui.toast;
    expect(toast?.text).toBe("Panoya kopyalanamadı");
    expect(toast?.tone, "hata bildirimi başarı tonunda").toBe("err");
  });

  it("kilitli sekmede de kopyalanıyor", async () => {
    /*
     * Kilit klasörün DEĞİŞMESİNİ engelliyor, okunmasını değil; kopyalamayı da
     * kapatmak kilidi cezaya çevirirdi.
     */
    seed(true);
    const { container } = render(<StatusBar />);

    await act(async () => {
      fireEvent.click(copyBtn(container)!);
    });
    expect(writeText).toHaveBeenCalledWith(CWD);
  });
});
