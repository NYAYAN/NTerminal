// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import type { Group, TabState } from "../types";
import { sessions, useStore } from "./useStore";

/**
 * Yapıştırma: pano Rust'tan okunuyor, metin kutu açıksa KUTUYA gidiyor.
 *
 * BİLDİRİLEN HATA: "Bir şeyi kopyalayıp yapıştır dediğimde komut satırında
 * 'paste' diye bir şey çıkıyor; buna gerek yok, doğrudan yapıştırabilmeliyim."
 *
 * O düğme WebKit'in: macOS'ta `navigator.clipboard.readText()` panoyu ancak
 * kullanıcı kendi "Paste" düğmesine tıklarsa veriyor. Tıklayınca da çoğu zaman
 * bir şey olmuyordu — metin `term.paste()`e gidiyordu ve kutu açıkken
 * terminalin girdisi kapalı (`disableStdin`), xterm onu sessizce atıyordu.
 * Hikâyenin tamamı `pasteClipboard` üzerinde.
 */

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
    lastCommand: null,
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

const initial = useStore.getState();

/** Komut kutusu: açıkken kendini depoya kaydediyor (`CommandInput`). */
const sink = vi.fn();
/** Oturumların terminal yolu; panoyu OKUMUYOR, yalnızca verileni yazıyor. */
const pasteT1 = vi.fn();
const pasteT2 = vi.fn();

/** İki sekmeli grup, etkin olan t1. `box`: t1'in komut kutusu açık mı. */
function seed(box: boolean) {
  sessions.set("t1", { pasteText: pasteT1 } as never);
  sessions.set("t2", { pasteText: pasteT2 } as never);
  useStore.setState({
    groups: [group([tab("t1"), tab("t2")])],
    activeGroupId: "g1",
    appInputSink: box ? sink : null,
  });
}

function clipboard(text: string | null) {
  return vi.spyOn(api, "clipboardReadText").mockResolvedValue(text);
}

beforeEach(() => {
  setLanguage("tr");
  sink.mockClear();
  pasteT1.mockClear();
  pasteT2.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  sessions.clear();
  useStore.setState({
    groups: [],
    activeGroupId: null,
    appInputSink: initial.appInputSink,
    ui: initial.ui,
  });
});

describe("yapıştırma", () => {
  it("kutu açıkken metin KUTUYA gidiyor, terminale değil", async () => {
    // Terminalin girdisi bu kipte kapalı: oraya giden metin kayboluyordu.
    seed(true);
    clipboard("npm run dev");
    await useStore.getState().pasteClipboard("t1");
    expect(sink).toHaveBeenCalledWith("npm run dev", "insert");
    expect(pasteT1, "metin kapalı girdiye gitti").not.toHaveBeenCalled();
  });

  it("kutu kapalıyken (klasik terminal, vim) terminale gidiyor", async () => {
    seed(false);
    clipboard("npm run dev");
    await useStore.getState().pasteClipboard("t1");
    expect(pasteT1).toHaveBeenCalledWith("npm run dev");
  });

  it("başka bir bölmeye yapıştırılan metin o bölmenin terminaline gidiyor", async () => {
    // Kutu yalnızca ETKİN sekmenin; t2'ye yapıştırılan metnin t1'in kutusuna
    // düşmesi yanlış kabuğa komut yazmak olurdu.
    seed(true);
    clipboard("ls");
    await useStore.getState().pasteClipboard("t2");
    expect(pasteT2).toHaveBeenCalledWith("ls");
    expect(sink).not.toHaveBeenCalled();
  });

  it("pano boşsa ya da metin taşımıyorsa hiçbir şey olmuyor, balon da yok", async () => {
    // Görsel kopyalamak bir hata değil; her yapıştırmada balon gürültü olurdu.
    seed(true);
    clipboard(null);
    await useStore.getState().pasteClipboard("t1");
    expect(sink).not.toHaveBeenCalled();
    expect(pasteT1).not.toHaveBeenCalled();
    expect(useStore.getState().ui.toast).toBe(null);
  });

  it("pano okunamazsa kullanıcı bunu duyuyor", async () => {
    // Windows'ta panoyu açık bırakan bir uygulama okumayı düşürebiliyor.
    // Sessiz kalan bir yapıştırma "tıklıyorum, bir şey olmuyor" demek.
    seed(true);
    vi.spyOn(api, "clipboardReadText").mockRejectedValue("ClipboardOccupied");
    await useStore.getState().pasteClipboard("t1");
    expect(useStore.getState().ui.toast).toEqual({ text: "Pano okunamadı", tone: "err" });
    expect(sink).not.toHaveBeenCalled();
  });
});

/*
 * Arayüz panoyu KENDİSİ okumuyor.
 *
 * `navigator.clipboard.readText()` (ya da `read()`) macOS'ta her çağrıda
 * WebKit'in "Paste" onay düğmesini çıkarıyor; bildirilen hata tam olarak bu.
 * Davranışı jsdom'da kurmak WebKit gerektiriyor, o yüzden kaynaktan
 * bağlanıyor: okuma `api.clipboardReadText` (Rust) üzerinden geçmeli.
 * Yazmak (`writeText`) serbest — o izin sormuyor.
 */
describe("pano okuma yolu", () => {
  /** Yorumları atar: gerekçesini anlatan yorumlar ihlal sayılmasın. */
  const strip = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const files = readdirSync(join(process.cwd(), "src"), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  it("kaynakta navigator.clipboard ile okuma yok", () => {
    expect(files.length, "kaynak dosyalar bulunamadı").toBeGreaterThan(50);
    const ihlal = files.filter((f) =>
      /clipboard\s*\??\.\s*read(Text)?\s*\(/.test(strip(readFileSync(join(process.cwd(), "src", f), "utf8"))),
    );
    expect(ihlal, "WebKit'in 'Paste' düğmesi geri gelir").toEqual([]);
  });
});
