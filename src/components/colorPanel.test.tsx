// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hexToHsv, hsvToHex } from "../lib/hsv";
import { setLanguage } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { Group } from "../types";
import { ColorButton, ColorPanel } from "./ColorPanel";
import { GroupColorPicker } from "./GroupColorPicker";
import { GroupRail } from "./GroupRail";

/**
 * Uygulamanın kendi renk seçicisi.
 *
 * BİLDİRİLEN: "Grup sağ tıklayıp rengi değiştir diyorum, sonra özel renk
 * diyince özel renk kutusu ekranın en sol alt köşesinde çıkıyor." Özel renk
 * yerel `<input type="color">`du ve macOS'ta WebKit onun seçicisini girdiye
 * göre konumluyor. Ekran dışı bir WKWebView'de ölçüldü: görünmez 0×0 girdi
 * için açılır pencere ekranın sol alt köşesine (0,23) düştü; boyut verilen
 * girdide yatayda doğru, dikeyde pencerenin tersine yansımış yerde açıldı.
 * Sayfa bu konuma karışamıyor; seçici artık sayfanın içinde, kutuların
 * hemen altında.
 */

function group(color: string | null): Group {
  return {
    id: "g1",
    name: "NTerminal",
    color,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: null,
    tabs: [],
  };
}

const initial = useStore.getState();
const color = () => useStore.getState().groups[0].color;

function seed(c: string | null) {
  useStore.setState({ groups: [group(c)], activeGroupId: "g1" });
}

/** Seçiciyi `GroupColorPicker` içinde çizer; grup depodan okunuyor. */
function Picker() {
  const g = useStore((s) => s.groups[0]);
  return <GroupColorPicker group={g} onClose={() => {}} />;
}

const customSwatch = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".swatch.custom")!;
const hexBox = (c: HTMLElement) => c.querySelector<HTMLInputElement>(".color-hex")!;
const area = (c: HTMLElement) => c.querySelector<HTMLElement>(".color-area")!;
const hue = (c: HTMLElement) => c.querySelector<HTMLInputElement>(".color-hue")!;

/** jsdom ölçü yapmıyor: alana 200x100'lük bir dikdörtgen verir. */
function measureArea(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0 }) as DOMRect;
}

beforeEach(() => {
  setLanguage("tr");
});

afterEach(() => {
  cleanup();
  useStore.setState({ groups: [], activeGroupId: null, settings: initial.settings, ui: initial.ui });
});

// --------------------------------------------------------------- kaynak

/** `src` altındaki test dışı .tsx dosyaları. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

describe("yerel renk girdisi", () => {
  it("uygulamanın hiçbir yerinde yok", () => {
    // Biri geri gelirse macOS'ta seçicisi yine ekranın köşesinde açılır.
    // Yorumlar sayılmıyor: gerekçeler eski girdiyi adıyla anıyor.
    const code = (f: string) =>
      readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const kalan = sources(join(process.cwd(), "src")).filter((f) =>
      /type=["']color["']/.test(code(f)),
    );
    expect(kalan, `yerel renk girdisi:\n${kalan.join("\n")}`).toEqual([]);
  });
});

// ------------------------------------------------------- grup rengi seçicisi

describe("grup rengi: özel renk", () => {
  it("gökkuşağı kutusu seçiciyi kutuların altında açıp kapatıyor", () => {
    seed("#58a6ff");
    const { container } = render(<Picker />);
    expect(customSwatch(container).tagName).toBe("BUTTON");
    expect(customSwatch(container).getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".color-panel")).toBeNull();

    fireEvent.click(customSwatch(container));
    expect(customSwatch(container).getAttribute("aria-expanded")).toBe("true");
    const panel = container.querySelector(".color-panel")!;
    // Kutuların ızgarasında, gökkuşağı kutusundan sonra: kendi satırında.
    expect(panel.parentElement!.classList.contains("color-swatches")).toBe(true);
    expect(customSwatch(container).nextElementSibling).toBe(panel);
    expect(hexBox(container).value).toBe("#58a6ff");

    fireEvent.click(customSwatch(container));
    expect(container.querySelector(".color-panel")).toBeNull();
  });

  it("geçerli kod yazılır yazılmaz uygulanıyor; yarım kod uygulanmıyor", () => {
    seed("#58a6ff");
    const { container } = render(<Picker />);
    fireEvent.click(customSwatch(container));

    fireEvent.change(hexBox(container), { target: { value: "#ff88" } });
    expect(color(), "yarım kod uygulandı").toBe("#58a6ff");
    expect(hexBox(container).getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(hexBox(container), { target: { value: "#FF8800" } });
    expect(color()).toBe("#ff8800");
    expect(hexBox(container).getAttribute("aria-invalid")).toBe("false");
    // Hazırların dışında bir renk: gökkuşağı kutusu işaretli.
    expect(customSwatch(container).classList.contains("on")).toBe(true);

    fireEvent.change(hexBox(container), { target: { value: "#ff" } });
    fireEvent.blur(hexBox(container));
    expect(hexBox(container).value, "yarım kod kutuda kaldı").toBe("#ff8800");
  });

  it("açıkken hazır renge basınca seçici o renge dönüyor; seçici açık kalıyor", () => {
    seed("#ff8800");
    const { container } = render(<Picker />);
    fireEvent.click(customSwatch(container));
    fireEvent.click(container.querySelector('.swatch[title="#3fb950"]')!);
    expect(color()).toBe("#3fb950");
    expect(hexBox(container).value).toBe("#3fb950");
    expect(customSwatch(container).classList.contains("on")).toBe(false);
  });
});

// --------------------------------------------------------- seçicinin kendisi

describe("ColorPanel", () => {
  it("alanda tıklayıp sürüklemek doygunluğu ve parlaklığı değiştiriyor", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<ColorPanel value="#58a6ff" onChange={onChange} />);
    measureArea(area(container));
    const { h } = hexToHsv("#58a6ff")!;

    fireEvent.pointerDown(area(container), { clientX: 100, clientY: 25, pointerId: 1 });
    const first = hsvToHex({ h, s: 0.5, v: 0.75 });
    expect(onChange).toHaveBeenLastCalledWith(first);
    rerender(<ColorPanel value={first} onChange={onChange} />);

    // Alanın dışına taşan sürükleme kenarda duruyor.
    fireEvent.pointerMove(area(container), { clientX: 260, clientY: -40, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(hsvToHex({ h, s: 1, v: 1 }));

    fireEvent.pointerUp(area(container), { pointerId: 1 });
    const calls = onChange.mock.calls.length;
    fireEvent.pointerMove(area(container), { clientX: 10, clientY: 90, pointerId: 1 });
    expect(onChange, "bırakıldıktan sonra da izliyor").toHaveBeenCalledTimes(calls);
  });

  it("klavyeyle de: oklar yüzde bir, Shift ile yüzde on", () => {
    const onChange = vi.fn();
    const { container } = render(<ColorPanel value="#808080" onChange={onChange} />);
    fireEvent.keyDown(area(container), { key: "ArrowRight", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(hsvToHex({ h: 0, s: 0.1, v: 128 / 255 }));
    expect(area(container).getAttribute("aria-valuetext")).toBe("Doygunluk %10, parlaklık %50");
  });

  it("ton çubuğu tonu değiştiriyor; gri renkte kod aynı kalıp alan o tona boyanıyor", () => {
    const onChange = vi.fn();
    const { container } = render(<ColorPanel value="#ff0000" onChange={onChange} />);
    fireEvent.change(hue(container), { target: { value: "120" } });
    expect(onChange).toHaveBeenLastCalledWith("#00ff00");
    cleanup();

    const grey = vi.fn();
    const view = render(<ColorPanel value="#808080" onChange={grey} />);
    fireEvent.change(hue(view.container), { target: { value: "120" } });
    expect(grey, "gri renk değişti").not.toHaveBeenCalled();
    expect(area(view.container).style.backgroundColor).toBe("rgb(0, 255, 0)");
  });

  it("değer dışarıdan değişince seçici ona dönüyor", () => {
    const { container, rerender } = render(<ColorPanel value="#58a6ff" onChange={() => {}} />);
    rerender(<ColorPanel value="#d29922" onChange={() => {}} />);
    expect(hexBox(container).value).toBe("#d29922");
    expect(hue(container).value).toBe(String(Math.round(hexToHsv("#d29922")!.h)));
  });
});

describe("ColorButton (Ayarlar'daki renk alanı)", () => {
  it("rengi gösteriyor; basınca seçici altında açılıyor ve bildiriyor", () => {
    const onChange = vi.fn();
    const { container, getByLabelText } = render(
      <ColorButton value={null} label="Renk" onChange={onChange} />,
    );
    const well = getByLabelText("Renk");
    expect(well.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".color-panel")).toBeNull();

    fireEvent.click(well);
    expect(well.getAttribute("aria-expanded")).toBe("true");
    expect(hexBox(container).value, "renksiz alanın başlangıcı").toBe("#58a6ff");
    fireEvent.change(hexBox(container), { target: { value: "#bc8cff" } });
    expect(onChange).toHaveBeenCalledWith("#bc8cff");
  });
});

// ------------------------------------------------------------ Kokpit rayı

describe("Kokpit rayında özel renk", () => {
  it("karonun yanındaki kutuda açılıyor ve içinde çalışmak kutuyu kapatmıyor", () => {
    const s = initial.settings;
    useStore.setState({
      groups: [group("#58a6ff")],
      activeGroupId: "g1",
      settings: { ...s, appearance: { ...s.appearance, design: "kokpit" } },
    });
    const { container } = render(<GroupRail />);
    fireEvent.contextMenu(container.querySelector(".grail-item")!);
    const item = [...document.querySelectorAll<HTMLButtonElement>(".ctx-menu button.ctx-item")].find(
      (el) => el.querySelector(".ctx-label")?.textContent === "Rengi değiştir",
    )!;
    fireEvent.click(item);

    const pop = document.querySelector<HTMLElement>(".grail-pop")!;
    fireEvent.mouseDown(customSwatch(pop));
    fireEvent.click(customSwatch(pop));
    expect(pop.querySelector(".color-panel")).not.toBeNull();

    fireEvent.mouseDown(hexBox(pop));
    fireEvent.change(hexBox(pop), { target: { value: "#ff8800" } });
    expect(color()).toBe("#ff8800");
    expect(document.querySelector(".grail-pop"), "kutu kapandı").not.toBeNull();
  });
});
