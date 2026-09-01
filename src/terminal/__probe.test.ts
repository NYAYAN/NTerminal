// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const handlers = new Map<string, (b: Uint8Array) => void>();
  return {
    handlers,
    emit(id: string, text: string) {
      handlers.get(id)?.(new TextEncoder().encode(text));
    },
  };
});

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: (_t, p: string) =>
      p === "ptySpawn"
        ? vi.fn(async () => ({ pid: 1, shell: "ps", integration: true, cwd: "C:/x" }))
        : vi.fn(async () => null),
  }),
  onPtyData: async (id: string, handler: (b: Uint8Array) => void) => {
    h.handlers.set(id, handler);
    return () => h.handlers.delete(id);
  },
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { TerminalSession } = await import("./TerminalSession");

describe("sonda", () => {
  it("jsdom'da attach ve onRender", async () => {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
    (window as unknown as { matchMedia: unknown }).matchMedia = (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
    const rafVar = typeof globalThis.requestAnimationFrame === "function";

    const s = new TerminalSession({
      tabId: "p1",
      groupId: "g1",
      profileId: "pr1",
      cwd: null,
      env: {},
      settings: useStore.getState().settings,
      windowsBuild: 22000,
      restoreScrollback: false,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    let attachHata: string | null = null;
    try {
      s.attach(host);
    } catch (e) {
      attachHata = String(e);
    }
    let renderSayisi = 0;
    s.term.onRender(() => renderSayisi++);
    let blokSayisi = 0;
    s.setBlockListener(() => blokSayisi++);
    await s.start(null);
    await new Promise<void>((r) => s.term.write("merhaba dünya\r\n", () => r()));
    await new Promise((r) => setTimeout(r, 60));
    const out = { rafVar, attachHata, renderSayisi, blokSayisi, ekran: !!host.querySelector(".xterm-screen") };
    const { writeFileSync } = await import("node:fs");
    writeFileSync("probe-out.json", JSON.stringify(out, null, 2));
    expect(true).toBe(true);
    void s.dispose(true);
  });
});
