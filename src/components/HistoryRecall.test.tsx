// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Favorite, Group, TabState } from "../types";

/**
 * Ctrl+R: favoriler DAVETSİZ gelmiyor.
 *
 * BİLDİRİLEN: "Ctrl+R yapınca 'bu sekmenin geçmişinde ara' çıkıyor ama en
 * üstte favorilere eklediklerim geliyor, gelmemeli. Orada bir tik olabilir,
 * favorileri de göster."
 *
 * Haklı bir şikâyet: pencerenin sorduğu soru "bu sekmede ne çalıştırdım" ve
 * favori o sorunun cevabı değil — hiç çalıştırılmamış bir favori de listenin
 * başını tutup aranan komutu aşağı itiyordu.
 *
 * Buradaki en sinsi tuzak ikinci test: favoriler gizlenirken aynı komutun
 * GEÇMİŞTEKİ kaydı da elenirse, kullanıcı en çok kullandığı komutu (favoriye
 * eklediği için) Ctrl+R ile hiç bulamaz. Tekrar süzgeci bu yüzden yalnızca
 * favoriler listedeyken çalışıyor.
 */

const { GECMIS } = vi.hoisted(() => ({
  GECMIS: [
    {
      id: "h1",
      command: "npm test",
      tabId: "t1",
      groupId: "g1",
      profileId: "p1",
      cwd: null,
      startedAt: 2,
      durationMs: 10,
      exitCode: 0,
      source: "integration",
    },
    {
      id: "h2",
      command: "git status",
      tabId: "t1",
      groupId: "g1",
      profileId: "p1",
      cwd: null,
      startedAt: 1,
      durationMs: 10,
      exitCode: 0,
      source: "integration",
    },
  ],
}));

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      historyQuery: async () => ({
        entries: GECMIS,
        total: GECMIS.length,
        grandTotal: GECMIS.length,
      }),
      favoritesList: async () => [],
    } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { HistoryRecall } = await import("./HistoryRecall");
const { setLanguage } = await import("../lib/i18n");

function tab(id: string): TabState {
  return {
    id,
    title: id,
    customTitle: null,
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

function favorite(id: string, command: string): Favorite {
  return {
    id,
    command,
    label: null,
    note: null,
    groupId: null,
    folder: null,
    cwd: null,
    createdAt: 0,
    usedCount: 0,
    lastUsedAt: null,
  };
}

/** Listedeki komutlar, ekrandaki sırayla. */
const satirlar = (c: HTMLElement) =>
  [...c.querySelectorAll(".palette-row .txt")].map((el) => el.textContent);

const tik = (c: HTMLElement) =>
  c.querySelector<HTMLInputElement>(".palette-foot input[type=checkbox]")!;

const kutu = (c: HTMLElement) => c.querySelector<HTMLInputElement>(".palette input")!;

beforeEach(() => {
  setLanguage("tr");
  useStore.setState({
    groups: [group([tab("t1")])],
    activeGroupId: "g1",
    // "npm test" HEM geçmişte HEM favorilerde; "docker compose up" yalnızca favori.
    favorites: [favorite("f1", "docker compose up"), favorite("f2", "npm test")],
  });
});

afterEach(() => {
  cleanup();
  useStore.setState({ groups: [], activeGroupId: null, favorites: [] });
});

describe("Ctrl+R geçmiş penceresi", () => {
  it("favoriler varsayılan olarak listede YOK", async () => {
    const { container } = render(<HistoryRecall />);
    await waitFor(() => expect(satirlar(container)).toHaveLength(2));

    expect(satirlar(container)).toEqual(["npm test", "git status"]);
    expect(container.querySelector(".star"), "favori yıldızı çizilmiş").toBe(null);
    expect(tik(container).checked).toBe(false);
  });

  it("favoriye eklenmiş komut GEÇMİŞTE kalıyor", async () => {
    // Tekrar süzgeci favoriler kapalıyken de çalışsaydı `npm test` hem favori
    // satırı olmadığı hem de geçmişten elendiği için tümden kaybolurdu.
    const { container } = render(<HistoryRecall />);
    await waitFor(() => expect(satirlar(container)).toContain("npm test"));

    expect(satirlar(container).filter((c) => c === "npm test")).toHaveLength(1);
  });

  it("tik favorileri listenin başına getiriyor", async () => {
    const { container } = render(<HistoryRecall />);
    await waitFor(() => expect(satirlar(container)).toHaveLength(2));

    fireEvent.click(tik(container));

    // Favoriler önce; geçmişteki "npm test" artık favori satırıyla temsil
    // ediliyor, iki kez görünmüyor.
    expect(satirlar(container)).toEqual(["docker compose up", "npm test", "git status"]);
    expect(container.querySelectorAll(".star")).toHaveLength(2);
  });

  it("tikten sonra odak arama kutusuna dönüyor", async () => {
    // Odak tikte kalsaydı, tıklayıp yazmaya devam eden kullanıcının harfleri
    // hiçbir yere gitmezdi — kutu klavyeyle kullanılıyor.
    const { container } = render(<HistoryRecall />);
    await waitFor(() => expect(satirlar(container)).toHaveLength(2));

    fireEvent.click(tik(container));
    expect(document.activeElement).toBe(kutu(container));
  });

  it("Ctrl+F tikin klavye karşılığı", async () => {
    const { container } = render(<HistoryRecall />);
    await waitFor(() => expect(satirlar(container)).toHaveLength(2));

    fireEvent.keyDown(kutu(container), { key: "f", ctrlKey: true });
    expect(tik(container).checked, "tik tuşu izlemiyor").toBe(true);
    expect(satirlar(container)).toContain("docker compose up");

    fireEvent.keyDown(kutu(container), { key: "f", ctrlKey: true });
    expect(satirlar(container)).not.toContain("docker compose up");
  });

  it("kapsam değişince seçim başa dönüyor", async () => {
    // Eski indeks yeni listede bambaşka bir komutu gösterirdi ve Enter onu
    // çalıştırırdı — geçmişten yanlış komut koşturmak pahalı bir kaza.
    const { container } = render(<HistoryRecall />);
    await waitFor(() => expect(satirlar(container)).toHaveLength(2));

    fireEvent.keyDown(kutu(container), { key: "ArrowDown" });
    expect(container.querySelectorAll(".palette-row")[1].className).toContain("on");

    fireEvent.keyDown(kutu(container), { key: "f", ctrlKey: true });
    expect(container.querySelectorAll(".palette-row")[0].className).toContain("on");
  });
});
