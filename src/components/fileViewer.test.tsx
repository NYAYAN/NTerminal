// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { FileText } from "../types";
import { FileViewer } from "./FileViewer";

/*
 * Dosya görüntüleyicisinde düzenlemek.
 *
 * İSTEK: "Dosyalar kısmından bir dosyayı açtığımda orada da düzenleme
 * yapabilmeliyim, orada kaydet butonu da yer almalı. Düzenle, geri al, ileri
 * al, kaydet gibi şeyler de olmalı." Ve: "kalem açık kapalı — kullanıcının da
 * anlaması gerek." En önemli güvence: kaydedilmemiş olan sessizce kaybolmuyor
 * ve dosya başka yerde kaydedildiyse üzerine yazılmıyor.
 */

const PATH = "/depo/src/a.ts";

function text(t: string, more: Partial<FileText> = {}): FileText {
  return { text: t, binary: false, truncated: false, size: t.length, ...more };
}

let disk: FileText | null = text("bir\niki\n");

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  disk = text("bir\niki\n");
  vi.spyOn(api, "readTextFile").mockImplementation(async () => disk);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const tool = (c: HTMLElement, name: string) => c.querySelector(`button[data-tool="${name}"]`) as HTMLButtonElement;
const editor = (c: HTMLElement) => c.querySelector(".viewer-editor") as HTMLTextAreaElement;
const type = (c: HTMLElement, value: string) => fireEvent.input(editor(c), { target: { value } });

describe("düzenle / geri al / ileri al / kaydet", () => {
  it("varsayılan salt okunur; kalem açınca vurgulu ve yazılabilir, kapatınca kaydedip kapanıyor", async () => {
    const write = vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    expect(editor(container)).toBe(null);
    expect(container.querySelectorAll(".viewer-line")).toHaveLength(3);
    expect(tool(container, "edit").getAttribute("aria-pressed")).toBe("false");
    expect(tool(container, "edit").title).toBe("Düzenle");
    expect(tool(container, "undo").disabled).toBe(true);
    expect(tool(container, "redo").disabled).toBe(true);
    expect(tool(container, "save").disabled).toBe(true);

    fireEvent.click(tool(container, "edit"));
    await settle();
    expect(editor(container).value).toBe("bir\niki\n");
    expect(document.activeElement).toBe(editor(container));
    expect(tool(container, "edit").getAttribute("aria-pressed")).toBe("true");
    expect(tool(container, "edit").className).toContain("on");
    expect(tool(container, "edit").title).toBe("Düzenlemeyi kapat");
    expect(container.querySelector(".viewer-head.editing")).not.toBe(null);

    type(container, "bir\niki\nüç\n");
    await settle();
    expect(container.querySelector(".viewer-dirty")?.getAttribute("title")).toBe("Kaydedilmemiş değişiklikler var");
    expect(tool(container, "save").disabled).toBe(false);
    expect(write, "kayıt açık: kendiliğinden yazmıyor").not.toHaveBeenCalled();

    fireEvent.click(tool(container, "edit"));
    await settle();
    expect(editor(container)).toBe(null);
    expect(write).toHaveBeenCalledWith(PATH, "bir\niki\n", "bir\niki\nüç\n");
    expect(container.querySelector(".viewer-dirty")).toBe(null);
    // Okuma görünümü yazılanı gösteriyor.
    expect([...container.querySelectorAll(".viewer-text")].map((e) => e.textContent)).toEqual(["bir", "iki", "üç", " "]);
  });

  it("Kaydet düğmesi ve Ctrl+S yazıyor; ikinci kayıt bir öncekinin üzerine", async () => {
    const write = vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    type(container, "BIR\niki\n");
    fireEvent.click(tool(container, "save"));
    await settle();
    expect(write).toHaveBeenLastCalledWith(PATH, "bir\niki\n", "BIR\niki\n");
    expect(tool(container, "save").disabled).toBe(true);

    type(container, "BIR\nIKI\n");
    fireEvent.keyDown(editor(container), { key: "s", code: "KeyS", ctrlKey: true });
    await settle();
    expect(write).toHaveBeenLastCalledWith(PATH, "BIR\niki\n", "BIR\nIKI\n");
  });

  it("geri al / ileri al: düğmeler ve Ctrl+Z / Ctrl+Y", async () => {
    vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    type(container, "bir\niki\nx\n");
    await settle();
    expect(tool(container, "undo").title).toBe("Geri al (Ctrl+Z)");
    expect(tool(container, "redo").title).toBe("İleri al (Ctrl+Y)");
    expect(tool(container, "save").title).toBe("Kaydet (Ctrl+S)");

    fireEvent.click(tool(container, "undo"));
    await settle();
    expect(editor(container).value).toBe("bir\niki\n");
    expect(container.querySelector(".viewer-dirty"), "geri alınınca kaydedilecek bir şey yok").toBe(null);
    fireEvent.click(tool(container, "redo"));
    await settle();
    expect(editor(container).value).toBe("bir\niki\nx\n");

    fireEvent.keyDown(editor(container), { key: "z", code: "KeyZ", ctrlKey: true });
    await settle();
    expect(editor(container).value).toBe("bir\niki\n");
    fireEvent.keyDown(editor(container), { key: "y", code: "KeyY", ctrlKey: true });
    await settle();
    expect(editor(container).value).toBe("bir\niki\nx\n");
  });

  it("başka dosyaya geçerken ve kapanırken kaydedilmemiş olan yazılıyor", async () => {
    const write = vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
    const { container, rerender, unmount } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    type(container, "bir\n");
    rerender(<FileViewer path="/depo/b.ts" />);
    await settle();
    expect(write).toHaveBeenCalledWith(PATH, "bir\niki\n", "bir\n");
    expect(editor(container), "yeni dosya salt okunur açılıyor").toBe(null);

    fireEvent.click(tool(container, "edit"));
    await settle();
    type(container, "b\n");
    unmount();
    expect(write).toHaveBeenLastCalledWith("/depo/b.ts", "bir\niki\n", "b\n");
  });

  it("CRLF dosyada satır sonları korunuyor", async () => {
    disk = text("x\r\ny\r\n");
    const write = vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    expect(editor(container).value).toBe("x\ny\n");
    type(container, "x\nyz\n");
    fireEvent.click(tool(container, "save"));
    await settle();
    expect(write).toHaveBeenCalledWith(PATH, "x\r\ny\r\n", "x\r\nyz\r\n");
  });

  it("kesilen, ikili ve satır sonları karışık dosyada kalem kapalı ve nedenini söylüyor", async () => {
    for (const f of [text("a\n", { truncated: true }), text("", { binary: true }), text("a\r\nb\n")]) {
      disk = f;
      const { container } = render(<FileViewer path={PATH} />);
      await settle();
      expect(tool(container, "edit").disabled).toBe(true);
      expect(tool(container, "edit").title).toContain("düzenlenemiyor");
      cleanup();
    }
  });
});

describe("dosya başka yerde kaydedildiyse", () => {
  it("üzerine yazmıyor; 'Benimkini kaydet' diskteki yeni hâlin üzerine yazıyor", async () => {
    const write = vi.spyOn(api, "writeTextFile").mockRejectedValueOnce("changed");
    const { container, getByText } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    type(container, "benim\n");
    fireEvent.click(tool(container, "save"));
    await settle();
    expect(container.querySelector(".viewer-issue span")?.textContent).toBe(
      "Dosya diskte değişti; buradaki değişiklikleriniz kaydedilmedi",
    );
    expect(tool(container, "save").disabled, "seçilene kadar kayıt yok").toBe(true);
    fireEvent.keyDown(editor(container), { key: "s", code: "KeyS", ctrlKey: true });
    await settle();
    expect(write, "Ctrl+S de yazmıyor").toHaveBeenCalledTimes(1);

    disk = text("baska yerde\n");
    write.mockResolvedValue(undefined);
    fireEvent.click(getByText("Benimkini kaydet"));
    await settle();
    expect(write).toHaveBeenLastCalledWith(PATH, "baska yerde\n", "benim\n");
    expect(container.querySelector(".viewer-issue")).toBe(null);
  });

  it("'Diskteki hâli yükle' buradakini bırakıyor", async () => {
    vi.spyOn(api, "writeTextFile").mockRejectedValueOnce("changed");
    const { container, getByText } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    type(container, "benim\n");
    fireEvent.click(tool(container, "save"));
    await settle();
    disk = text("baska yerde\n");
    fireEvent.click(getByText("Diskteki hâli yükle"));
    await settle();
    expect(container.querySelector(".viewer-issue")).toBe(null);
    expect(editor(container).value).toBe("baska yerde\n");
    expect(container.querySelector(".viewer-dirty")).toBe(null);
  });
});

/*
 * Aramadan gelinen satır.
 *
 * İçerik aramasından açılan dosya eşleşmenin satırına gidiyor ve eşleşme
 * işaretli duruyor. Konum Rust'tan TAM satırdaki UTF-16 sütunu olarak geliyor
 * (`search::LineHit.col`); görüntüleyici satırları aynı biçimde böldüğü için
 * işaret doğrudan `slice` ile kesiliyor.
 */
describe("aramadan gelinen satır", () => {
  const reveal = (line: number, col: number, len: number, seq = 1) => ({ line, col, len, seq });

  it("satır ve eşleşme işaretli", async () => {
    disk = text("bir\n  ğü foo\nüç\n");
    const { container } = render(<FileViewer path={PATH} reveal={reveal(2, 5, 3)} />);
    await settle();
    const hit = container.querySelectorAll(".viewer-line")[1];
    expect(hit.classList.contains("hit")).toBe(true);
    expect(hit.querySelector(".viewer-mark")?.textContent).toBe("foo");
    // Satırın kalanı kaybolmuyor.
    expect(hit.querySelector(".viewer-text")?.textContent).toBe("  ğü foo");
    expect(container.querySelectorAll(".viewer-line.hit")).toHaveLength(1);
  });

  it("dosya o arada kısaldıysa işaret satırı bozmuyor", async () => {
    disk = text("kisa\n");
    const { container } = render(<FileViewer path={PATH} reveal={reveal(1, 40, 3)} />);
    await settle();
    const line = container.querySelector(".viewer-line .viewer-text");
    expect(line?.textContent).toBe("kisa");
    expect(container.querySelector(".viewer-mark")).toBe(null);
  });

  it("gösterilen 512 KB'ın dışındaki satır SÖYLENİYOR", async () => {
    // Sessizce tepede kalmak "eşleşme burada değilmiş" sandırırdı.
    disk = text("a\nb\n", { truncated: true });
    const { container } = render(<FileViewer path={PATH} reveal={reveal(900, 0, 1)} />);
    await settle();
    const cuts = [...container.querySelectorAll(".viewer-cut")].map((el) => el.textContent);
    expect(cuts[0]).toBe("900. satır gösterilen ilk 512 KB'ın dışında kaldı");
  });

  it("düzenlerken eşleşme yazı alanında SEÇİLİYOR", async () => {
    // İşaret katmanı düzenlerken yok; seçim hem görünüyor hem üzerine yazılabiliyor.
    disk = text("bir\niki foo\n");
    const { container, rerender } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    rerender(<FileViewer path={PATH} reveal={reveal(2, 4, 3)} />);
    await settle();
    const area = editor(container);
    expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe("foo");
  });

  it("dosyayı kapatan düğme yalnızca görüntüleyiciyi kapatıyor", async () => {
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    const close = container.querySelector<HTMLButtonElement>(".viewer-close")!;
    expect(close.title).toBe("Dosyayı kapat");
    useStore.setState({ ui: { ...useStore.getState().ui, treeOpen: true, viewerPath: PATH } });
    fireEvent.click(close);
    expect(useStore.getState().ui.viewerPath).toBe(null);
    expect(useStore.getState().ui.treeOpen).toBe(true);
  });
});
