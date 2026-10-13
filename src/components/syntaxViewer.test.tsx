// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { setSyntaxHost, type SyntaxHost } from "../lib/syntax";
import { createSyntaxService, type SyntaxReply } from "../lib/syntaxService";
import type { FileText } from "../types";
import { FileViewer } from "./FileViewer";

/*
 * Dosya görüntüleyicisinde sözdizimi renklendirmesi.
 *
 * İSTEK: "Dosyaları açtığımda kodları renkli göstermek mümkün mü? VS Code'da,
 * IntelliJ'de, WebStorm'da nasıl oluyorsa öyle." Renklendirici burada iş
 * parçacığı yerine süreç içinde, ama aynı hizmet ve aynı gramerlerle; yanıtlar
 * iş parçacığındaki gibi sonraki görevde geliyor.
 *
 * Asıl güvence düzenlemede: yazı alanının harfleri saydam, görünen metin
 * altındaki katman. Katman yazı alanının metninden bir harf bile ayrışırsa
 * kullanıcı yazdığından başka bir şey görür.
 */

function text(t: string): FileText {
  return { text: t, binary: false, truncated: false, size: t.length };
}

let disk: FileText = text("");

function inProcessHost(): SyntaxHost {
  let receive: (reply: SyntaxReply) => void = () => {};
  const handle = createSyntaxService((reply) => setTimeout(() => receive(structuredClone(reply)), 0));
  return { post: (request) => handle(structuredClone(request)), listen: (fn) => (receive = fn) };
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  setSyntaxHost(inProcessHost());
  vi.spyOn(api, "readTextFile").mockImplementation(async () => disk);
  vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setSyntaxHost(undefined);
});

/** Koşul sağlanana kadar React'ı ve zamanlayıcıları ilerlet. */
async function until(check: () => unknown, ms = 15_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("zaman aşımı");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

const editor = (c: HTMLElement) => c.querySelector(".viewer-editor") as HTMLTextAreaElement;
const layer = (c: HTMLElement) => c.querySelector(".viewer-hl");
const spans = (c: HTMLElement, cls: string) => [...c.querySelectorAll(`.syn-${cls}`)].map((e) => e.textContent);

/**
 * Katmanın gösterdiği metin. Dilimler ayrı blok (aralarındaki satır sonu
 * bloğun kendisi) ve boş biten dilim satırını genişliksiz boşlukla tutuyor.
 */
const layerText = (c: HTMLElement) =>
  [...layer(c)!.children].map((part) => part.textContent!.replace(/​/g, "")).join("\n");

describe("sözdizimi renkleri", () => {
  it("okurken belirteçler kendi sınıflarıyla; satırın metni eksiksiz", async () => {
    disk = text('const ad = "x"; // not\nlet b = 2;\n');
    const { container } = render(<FileViewer path="/depo/a.ts" />);
    // Satırlar dilim dilim geliyor: yük altında ikinci satır sonraki dilime
    // kalabiliyor, ikisini de bekle.
    await until(() => container.querySelector(".syn-comment") && container.querySelector(".syn-number"));
    expect(spans(container, "keyword")).toEqual(["const", "let"]);
    expect(spans(container, "string")).toEqual(['"x"']);
    expect(spans(container, "comment")).toEqual(["// not"]);
    expect(spans(container, "number")).toEqual(["2"]);
    const rows = [...container.querySelectorAll(".viewer-text")].map((e) => e.textContent);
    expect(rows).toEqual(['const ad = "x"; // not', "let b = 2;", " "]);
  });

  it("aramadan gelinen eşleşme renkli satırda da işaretli", async () => {
    disk = text('const foo = "foo";\n');
    const { container } = render(<FileViewer path="/depo/a.ts" reveal={{ line: 1, col: 6, len: 3, seq: 1 }} />);
    await until(() => container.querySelector(".syn-string"));
    const mark = container.querySelector(".viewer-mark");
    expect(mark?.textContent).toBe("foo");
    expect(container.querySelector(".viewer-line.hit .viewer-text")?.textContent).toBe('const foo = "foo";');
  });

  it("düzenlerken katman yazı alanıyla AYNI metni çiziyor, yazı alanının harfleri saydam", async () => {
    disk = text("const a = 1;\nlet b;\n");
    const { container } = render(<FileViewer path="/depo/a.ts" />);
    await until(() => container.querySelector(".syn-keyword"));
    fireEvent.click(container.querySelector('button[data-tool="edit"]')!);
    await until(() => layer(container));
    expect(editor(container).classList.contains("colored")).toBe(true);
    expect(layer(container)!.getAttribute("aria-hidden")).toBe("true");
    expect(layerText(container)).toBe(editor(container).value);

    // Yazılan harf AYNI çizimde katmanda: renklendiricinin yanıtını beklemiyor.
    fireEvent.input(editor(container), { target: { value: "/* const a = 1;\nlet b;\n" } });
    expect(layerText(container)).toBe("/* const a = 1;\nlet b;\n");
    // Yorum açıldı: alttaki satır da yoruma dönüyor.
    await until(() => spans(container, "comment").join("").includes("let b;"));
    expect(spans(container, "keyword")).toEqual([]);

    // Satır ekleyip silmek katmanı yazı alanından ayırmıyor.
    for (const value of ["/* const a = 1;\n\n\nlet b;\n", "x\n", ""]) {
      fireEvent.input(editor(container), { target: { value } });
      expect(layerText(container)).toBe(value);
    }
  });

  it("dilim sınırlarında satır kaybolmuyor; boş biten dilim satırını tutuyor", async () => {
    // 64 satırlık dilimler ayrı blok: sınırda `\n` yok, boş satır genişliksiz
    // boşlukla duruyor. Biri şaşarsa sonraki bütün satırlar yazı alanından kayar.
    const lines = Array.from({ length: 150 }, (_, i) => (i % 64 === 63 ? "" : `let v${i} = ${i};`));
    disk = text(lines.join("\n") + "\n");
    const { container } = render(<FileViewer path="/depo/a.ts" />);
    await until(() => container.querySelector(".syn-keyword"));
    fireEvent.click(container.querySelector('button[data-tool="edit"]')!);
    await until(() => layer(container));
    const parts = [...layer(container)!.children];
    expect(parts.map((p) => p.className)).toEqual(["viewer-hl-part", "viewer-hl-part", "viewer-hl-part"]);
    expect(layerText(container)).toBe(editor(container).value);
    // Her dilim satırı kadar satır kutusu: 64, 64 ve kalan 23 (son boş satır dahil).
    expect(parts.map((p) => p.textContent!.split("\n").length)).toEqual([64, 64, 23]);
  });

  it("tanınmayan dosyada renk yok; düzenlerken yazı alanı harflerini kendisi çiziyor", async () => {
    disk = text("const a = 1;\n");
    const { container } = render(<FileViewer path="/depo/notlar.txt" />);
    await until(() => container.querySelector(".viewer-line"));
    fireEvent.click(container.querySelector('button[data-tool="edit"]')!);
    await until(() => editor(container));
    expect(layer(container)).toBe(null);
    expect(editor(container).classList.contains("colored")).toBe(false);
    expect(container.querySelector("[class^='syn-']")).toBe(null);
  });

  it("renklendirici yoksa (iş parçacığı açılamadı) dosya düz metin", async () => {
    setSyntaxHost(null);
    disk = text("const a = 1;\n");
    const { container } = render(<FileViewer path="/depo/a.ts" />);
    await until(() => container.querySelector(".viewer-line"));
    fireEvent.click(container.querySelector('button[data-tool="edit"]')!);
    await until(() => editor(container));
    expect(layer(container)).toBe(null);
    expect(editor(container).classList.contains("colored")).toBe(false);
  });
});
