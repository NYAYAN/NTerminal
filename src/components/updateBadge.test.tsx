// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import { StatusBar } from "./StatusBar";

/**
 * Durum çubuğundaki yeni sürüm rozeti.
 *
 * Çubuk bilinçli olarak sadeleştirildi: yalnızca kimlik taşıyor, okumalar "⋯"
 * menüsünde. Bu rozet o karara AYKIRI DEĞİL çünkü kalıcı bir okuma değil —
 * yapılacak bir şey varken çıkan geçici bir haber ve bir EYLEM.
 *
 * Tıklamak tarayıcıyı DEĞİL Ayarlar › Hakkında'yı açıyor: dış bağlantı açmak
 * kullanıcının kararı olmalı, küçük bir rozete kazara tıklamanın sonucu değil.
 */

const YENI = { version: "0.2.0", url: "https://example/r/0.2.0", notes: "" };

beforeEach(() => {
  setLanguage("tr");
  setPlatform("macos");
  useStore.setState({
    ready: true,
    groups: [],
    activeGroupId: null,
    update: null,
    ui: { ...useStore.getState().ui, settingsOpen: false, settingsSection: null },
  });
});

afterEach(cleanup);

describe("yeni sürüm rozeti", () => {
  it("güncelleme yokken ÇİZİLMİYOR", () => {
    // Kalıcı bir rozet, sadeleştirilen çubuğa geri konan bir okuma olurdu.
    const { container } = render(<StatusBar />);
    expect(container.querySelector(".status-btn.update")).toBe(null);
  });

  it("güncelleme varken sürümü yazıyor", () => {
    useStore.setState({ update: YENI });
    const { container } = render(<StatusBar />);
    const badge = container.querySelector(".status-btn.update");
    expect(badge, "rozet çizilmedi").not.toBe(null);
    expect(badge!.textContent).toContain("0.2.0");
  });

  it("tıklamak Ayarlar › Hakkında'yı açıyor", () => {
    useStore.setState({ update: YENI });
    const { container } = render(<StatusBar />);
    fireEvent.click(container.querySelector(".status-btn.update")!);

    const ui = useStore.getState().ui;
    expect(ui.settingsOpen).toBe(true);
    expect(ui.settingsSection, "yanlış bölümde açılıyor").toBe("about");
  });

  it("tarayıcı KENDİLİĞİNDEN açılmıyor", () => {
    // Dış bağlantı açmak kullanıcının kararı; rozet yalnızca haber veriyor.
    // Casus GERÇEK çağrının üstünde: kendi `vi.fn()`ini kurup ona bakmak
    // hiçbir şey ölçmezdi.
    const openExternal = vi.spyOn(api, "openExternal").mockResolvedValue(undefined);
    useStore.setState({ update: YENI });
    const { container } = render(<StatusBar />);
    fireEvent.click(container.querySelector(".status-btn.update")!);

    expect(openExternal, "rozet tarayıcı açtı").not.toHaveBeenCalled();
    openExternal.mockRestore();
  });
});
