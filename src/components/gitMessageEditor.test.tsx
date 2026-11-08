// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dosya = vi.hoisted(() => ({ oku: vi.fn(), yaz: vi.fn() }));

// Dosya okuma/yazma Rust'ta; burada taklit. Kalan IPC yüzeyi sessiz.
vi.mock("../lib/ipc", () => ({
  api: new Proxy({ readTextFile: dosya.oku, writeTextFile: dosya.yaz } as Record<string, unknown>, {
    get: (target, prop: string) => target[prop] ?? vi.fn(async () => null),
  }),
  onPtyExit: async () => () => {},
}));

import { setLanguage } from "../lib/i18n";
import { isMac } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { CommandInput } from "./CommandInput";
import { GitMessageEditor } from "./GitMessageEditor";

/*
 * git bir mesaj istediğinde komut kutusunun yerine gelen düzenleyici.
 *
 * BİLDİRİLEN: "`git pull` dediğimde komut yazın kısmında değil üst kısımda
 * `:q!` yazmak gerekiyor." git birleştirme mesajı için vim açıyordu; mesaj
 * artık kutuda düzenleniyor, git yanıt bekliyor (`nterminal-edit.sh`).
 */

const TAB = "t1";
const YOL = "/repo/.git/MERGE_MSG";
const MERGE_MSG = `Merge branch 'ozellik'

# Please enter a commit message to explain why this merge is necessary,
# especially if it merges an updated upstream into a topic branch.
`;

const finishEdit = vi.fn();
const yaziTipi = { fontFamily: "monospace", fontSize: "13px" };

beforeEach(() => {
  setLanguage("tr");
  finishEdit.mockClear();
  dosya.oku.mockReset().mockResolvedValue({ text: MERGE_MSG, truncated: false, binary: false, size: 160 });
  dosya.yaz.mockReset().mockResolvedValue(undefined);
  sessions.set(TAB, {
    finishEdit,
    setAppInput: vi.fn(),
    focus: vi.fn(),
    inputSignals: () => ({ atPrompt: false, altScreen: false, integration: true, program: null }),
    applicationCursorKeys: () => false,
    secretPrompt: () => false,
  } as never);
  useStore.setState({ ui: { ...useStore.getState().ui, toast: null } });
});

afterEach(() => {
  cleanup();
  sessions.delete(TAB);
  useStore.setState({ editRequests: {}, groups: [], activeGroupId: null, running: {} });
});

const alan = (c: HTMLElement) => c.querySelector<HTMLTextAreaElement>(".git-edit-field")!;
const dugme = (c: HTMLElement, metin: string) =>
  [...c.querySelectorAll<HTMLButtonElement>(".git-edit button")].find((b) => b.textContent === metin)!;

describe("git mesaj düzenleyicisi", () => {
  it("birleştirme mesajını gösteriyor; git'in açıklaması altta, düzenlenecek metne karışmıyor", async () => {
    const { container } = render(<GitMessageEditor tabId={TAB} path={YOL} typography={yaziTipi} />);
    await waitFor(() => expect(alan(container).value).toBe("Merge branch 'ozellik'"));
    expect(container.querySelector(".git-edit-title")?.textContent).toBe("Birleştirme mesajı");
    expect(container.querySelector(".git-edit-help")?.textContent).toContain("Please enter a commit message");
    expect(document.activeElement, "düzenleyici odağı almadı").toBe(alan(container));
  });

  it("Onayla dosyayı yazıyor, sonra git'e devam diyor", async () => {
    const { container } = render(<GitMessageEditor tabId={TAB} path={YOL} typography={yaziTipi} />);
    await waitFor(() => expect(alan(container).value).not.toBe(""));
    fireEvent.change(alan(container), { target: { value: "Özellik dalı birleştirildi" } });
    fireEvent.click(dugme(container, "Onayla"));
    await waitFor(() => expect(finishEdit).toHaveBeenCalledWith("ok"));
    // Beklenen içerik denetimiyle: dosya bu arada değiştiyse üstüne yazılmıyor.
    expect(dosya.yaz).toHaveBeenCalledWith(
      YOL,
      MERGE_MSG,
      expect.stringMatching(/^Özellik dalı birleştirildi\n\n# Please enter/),
    );
  });

  it("klavyeyle onay ve Esc ile bırakma", async () => {
    const { container } = render(<GitMessageEditor tabId={TAB} path={YOL} typography={yaziTipi} />);
    await waitFor(() => expect(alan(container).value).not.toBe(""));
    // Düz Enter satır açıyor: mesajın gövdesi birden çok satır olabilir.
    fireEvent.keyDown(alan(container), { key: "Enter" });
    expect(finishEdit).not.toHaveBeenCalled();
    fireEvent.keyDown(alan(container), { key: "Enter", ...(isMac() ? { metaKey: true } : { ctrlKey: true }) });
    await waitFor(() => expect(finishEdit).toHaveBeenCalledWith("ok"));

    finishEdit.mockClear();
    fireEvent.keyDown(alan(container), { key: "Escape" });
    expect(finishEdit).toHaveBeenCalledWith("cancel");
  });

  it("dosya okunamazsa git'in kendi düzenleyicisine dönülüyor", async () => {
    // Betik `editor` yanıtında `vi`yi açıyor; tuş çubuğu da onu tanıyor.
    dosya.oku.mockResolvedValue({ text: "", truncated: false, binary: true, size: 10 });
    render(<GitMessageEditor tabId={TAB} path={YOL} typography={yaziTipi} />);
    await waitFor(() => expect(finishEdit).toHaveBeenCalledWith("editor"));
    expect(useStore.getState().ui.toast?.text).toContain("okunamadı");
  });

  it("yazılamazsa düzenleyici açık kalıyor, git'e yanıt gitmiyor", async () => {
    dosya.yaz.mockRejectedValue("changed");
    const { container } = render(<GitMessageEditor tabId={TAB} path={YOL} typography={yaziTipi} />);
    await waitFor(() => expect(alan(container).value).not.toBe(""));
    fireEvent.click(dugme(container, "Onayla"));
    await waitFor(() => expect(useStore.getState().ui.toast?.text).toContain("kaydedilemedi"));
    expect(finishEdit).not.toHaveBeenCalled();
    expect(dugme(container, "Onayla").disabled, "Onayla kilitli kaldı").toBe(false);
  });
});

describe("komut kutusu ve git'in isteği", () => {
  function tab(id: string): TabState {
    return {
      id,
      title: id,
      customTitle: id,
      profileId: "p1",
      cwd: null,
      createdAt: 0,
      lastActiveAt: 0,
      hasScrollback: false,
      lastCommand: "git pull",
      locked: false,
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
      activeTabId: tabs[0]?.id ?? null,
      tabs,
    };
  }

  it("istek varken kutunun yerinde düzenleyici, istek bitince kutu geri geliyor", async () => {
    const state = useStore.getState();
    useStore.setState({
      groups: [group([tab(TAB)])],
      activeGroupId: "g1",
      ready: true,
      running: { [TAB]: true },
      inputSignals: { [TAB]: { atPrompt: false, altScreen: false, integration: true } },
      settings: { ...state.settings, behavior: { ...state.settings.behavior, appInput: true } },
      editRequests: { [TAB]: YOL },
    });
    const { container, rerender } = render(<CommandInput />);
    expect(container.querySelector(".git-edit"), "düzenleyici yok").not.toBe(null);
    expect(container.querySelector(".command-input-field"), "kutu da çizildi").toBe(null);
    await waitFor(() => expect(alan(container).value).toBe("Merge branch 'ozellik'"));

    useStore.setState({ editRequests: {} });
    rerender(<CommandInput />);
    expect(container.querySelector(".git-edit")).toBe(null);
    expect(container.querySelector(".command-input-field"), "yanıt satırı geri gelmedi").not.toBe(null);
  });
});
