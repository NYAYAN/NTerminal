// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Group, TabState } from "../types";

/**
 * Teşhis paneli (Ayarlar › Hakkında).
 *
 * Panelin işi donma araştırmasında sayı vermek; sayı yanlış sekmeye yazılırsa
 * ya da kopyalanan rapor ekrandakinden farklıysa ölçüm yanıltır. Doğrudan
 * testi yoktu.
 */

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: (target, prop) => target[prop as string] ?? (async () => undefined),
  }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { sessions, useStore } = await import("../store/useStore");
const { setLanguage } = await import("../lib/i18n");
const { HealthPanel } = await import("./HealthPanel");

function tab(id: string, title: string): TabState {
  return {
    // Ad kullanıcının verdiği ad: `tabLabel` elle verilen adı kabuk başlığına ve klasöre yeğliyor.
    id, title, customTitle: title, profileId: "p1", cwd: "/tmp", createdAt: 0, lastActiveAt: 0,
    hasScrollback: false, lastCommand: null, locked: false,
  };
}

function group(id: string, tabs: TabState[]): Group {
  return {
    id, name: id, color: null, icon: null, collapsed: false, favorite: false, ungrouped: false,
    defaultProfileId: null, defaultCwd: null, env: {}, activeTabId: tabs[0]?.id ?? null, tabs,
  };
}

/** Sayaçları sabit bir sahte oturum: sayılar ekranda aynen görünmeli. */
function sahteOturum(lines: number, markers: number) {
  return {
    healthCounters: () => ({ bufferLines: lines, markers, decorations: 2, blocks: 3, visible: true, webgl: false }),
  } as never;
}

beforeEach(() => {
  setLanguage("tr");
  sessions.clear();
  sessions.set("t1", sahteOturum(1200, 7));
  sessions.set("t2", sahteOturum(40, 1));
  useStore.setState({
    groups: [group("g1", [tab("t1", "build"), tab("t2", "logs")])],
    activeGroupId: "g1",
    ui: { ...useStore.getState().ui, toast: null },
  });
});

afterEach(() => {
  cleanup();
  sessions.clear();
});

describe("teşhis paneli", () => {
  it("her canlı terminali sekme adıyla ve sayaçlarıyla listeliyor", () => {
    const { container } = render(<HealthPanel />);
    const text = container.textContent ?? "";
    expect(text).toContain("Canlı terminaller");
    expect(text).toContain("2");
    const satir = [...container.querySelectorAll(".field")].find((f) => f.textContent?.startsWith("build"));
    expect(satir, "build sekmesinin satırı yok").toBeTruthy();
    expect(satir!.textContent).toContain("1200");
    expect(satir!.textContent).toContain("7");
  });

  it("takılma yoksa bunu söylüyor", () => {
    const { container } = render(<HealthPanel />);
    expect(container.textContent).toContain("Kayda geçen takılma yok");
  });

  it("kopyalanan rapor ekrandaki sayıları taşıyor", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { getByText } = render(<HealthPanel />);
    fireEvent.click(getByText("Ölçümü kopyala"));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const rapor = writeText.mock.calls[0][0] as string;
    expect(rapor).toContain("Teşhis");
    expect(rapor).toContain("build");
    expect(rapor).toContain("1200");
    expect(rapor).toContain("logs");
    await waitFor(() => expect(useStore.getState().ui.toast?.text).toBe("Ölçüm panoya kopyalandı"));
  });
});
