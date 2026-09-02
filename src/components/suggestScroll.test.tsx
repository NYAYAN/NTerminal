// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { SuggestionBar } from "./SuggestionBar";

/**
 * Seçili öneri görünür kalmalı.
 *
 * BİLDİRİLEN HATA: "ok yönleriyle yukarı doğru gittiğimde bir şeyi seçtim
 * görünüyorum ama scroll ok ile beraber hareket etmediği için seçtiğim şeyin
 * yazısı görünmüyor".
 *
 * Liste yüksekliği sınırlı ve kaydırılabilir (`max-height: 112px`, beş satır);
 * seçim o sınırın dışına çıkabiliyordu. Sonucu görünmez bir Enter: kullanıcı
 * neyi kabul ettiğini göremiyor. Aynı çözüm sekme çubuğunda zaten vardı.
 */

function tab(): TabState {
  return {
    id: "t1",
    title: "t1",
    customTitle: "t1",
    profileId: "p1",
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(): Group {
  return {
    id: "g1",
    name: "Grup",
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: "t1",
    tabs: [tab()],
  };
}

const ITEMS = ["cd .config", "cd bin", "cd Controllers", "cd DevTools", "cd src"];

function seed(index: number) {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    suggestHistory: [],
    ui: { ...state.ui, suggest: { items: ITEMS, index, input: "cd ", kind: "dirs" } },
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  const state = useStore.getState();
  useStore.setState({ ui: { ...state.ui, suggest: null } });
});

describe("öneri listesi kaydırması", () => {
  it("seçili satır görünür alana kaydırılıyor", () => {
    const scrollIntoView = vi.fn();
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(scrollIntoView);

    seed(4);
    render(<SuggestionBar />);

    expect(scrollIntoView, "seçili satır görünür alana çekilmiyor").toHaveBeenCalled();
  });

  it("kaydırma seçili satırdan yapılıyor", () => {
    // Yanlış öğeyi kaydırmak listeyi başka bir yere götürürdü; çağrının
    // hangi satırdan geldiği testin asıl konusu.
    let cagiran: Element | null = null;
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (
      this: Element,
    ) {
      cagiran = this;
    });

    seed(2);
    const { container } = render(<SuggestionBar />);

    expect(cagiran).toBe(container.querySelector(".suggest-row.on"));
  });

  it("yalnızca gerektiği kadar kaydırıyor", () => {
    /*
     * `block: "nearest"` bilinçli. Ortalamak her ok basışında listeyi
     * zıplatır ve komşu satırların yeri değişir — göz sırayı takip
     * edemez hâle gelir.
     */
    const scrollIntoView = vi.fn();
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(scrollIntoView);

    seed(1);
    render(<SuggestionBar />);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("liste kapalıyken bir şey çizilmiyor", () => {
    const state = useStore.getState();
    useStore.setState({
      ready: true,
      groups: [group()],
      activeGroupId: "g1",
      ui: { ...state.ui, suggest: null },
    });
    const { container } = render(<SuggestionBar />);
    expect(container.querySelector(".suggest-row")).toBe(null);
  });
});
