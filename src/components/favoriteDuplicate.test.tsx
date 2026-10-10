// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import type { Favorite } from "../types";
import { FavoritesPanel } from "./FavoritesPanel";

/**
 * Formdan ZATEN favori olan bir komutu eklemek.
 *
 * BİLDİRİLEN: `yarn start:dev` favorideyken "+ Favori" ile aynı komut `yysd`
 * kısaltmasıyla eklendi. Rust `add` var olan kaydı olduğu gibi döndürdü, form
 * kaydedilmiş gibi kapandı ve kısaltma hiçbir yere yazılmadı. Artık uyarı
 * formda duruyor, "Ekle" kaydetmiyor ve "Mevcut favoriyi düzenle" yazılanları
 * var olan kaydın üstüne taşıyor — kaydetmek yine kullanıcının elinde.
 */

function fav(id: string, command: string, extra: Partial<Favorite> = {}): Favorite {
  return {
    id,
    command,
    label: null,
    note: null,
    groupId: null,
    folder: null,
    cwd: null,
    alias: null,
    createdAt: 0,
    usedCount: 0,
    lastUsedAt: null,
    ...extra,
  };
}

/** Etkin sekmenin klasörü: yeni favori formu bunu HAZIR getiriyor. */
const AKTIF = "/proje/aktif";

const addFavorite = vi.fn(async (_: unknown): Promise<Favorite | null> => null);
const updateFavorite = vi.fn(async (_id: string, _patch: unknown) => true);
const initial = useStore.getState();

beforeEach(() => {
  setLanguage("tr");
  addFavorite.mockReset().mockResolvedValue(null);
  updateFavorite.mockReset().mockResolvedValue(true);
  useStore.setState({
    ready: true,
    groups: [{ id: "g1", name: "Yataş", color: null }],
    activeGroupId: null,
    favorites: [
      fav("f1", "npm run build --configuration", { alias: "nrb" }),
      fav("f2", "yarn start:dev", { label: "Dev sunucu", cwd: "/proje/yatas", folder: "Yataş" }),
    ],
    addFavorite,
    updateFavorite,
    activeSession: () => ({ cwd: AKTIF }),
    ui: { ...initial.ui, toast: null },
  } as never);
});

afterEach(() => {
  cleanup();
  setLanguage("tr");
  useStore.setState({
    groups: [],
    favorites: [],
    addFavorite: initial.addFavorite,
    updateFavorite: initial.updateFavorite,
    activeSession: initial.activeSession,
    ui: initial.ui,
  });
});

const formOf = (c: HTMLElement) => c.querySelector<HTMLElement>(".fav-form");
/** Form alanı, yer tutucusunun başıyla ("Kısa ad", "Kısaltma" ayrı). */
const field = (c: HTMLElement, placeholder: string) =>
  [...formOf(c)!.querySelectorAll<HTMLInputElement>("input")].find((i) =>
    i.placeholder.startsWith(placeholder),
  )!;
const notice = (c: HTMLElement) => formOf(c)?.querySelector<HTMLElement>('[role="alert"]') ?? null;
const type = (c: HTMLElement, placeholder: string, value: string) =>
  fireEvent.change(field(c, placeholder), { target: { value } });

/** "+ Favori" ile formu açar ve var olan komutu `yysd` kısaltmasıyla yazar. */
function newWithExisting(c: HTMLElement, getByText: (t: string) => HTMLElement) {
  fireEvent.click(getByText("+ Favori"));
  type(c, "Komut", "  yarn start:dev ");
  type(c, "Kısaltma", "yysd");
}

describe("formdan var olan komutu eklemek", () => {
  it("uyarı formda, Ekle kaydetmiyor, yazılan duruyor", () => {
    const { container, getByText } = render(<FavoritesPanel />);
    newWithExisting(container, getByText);

    // Yazarken görünüyor, Ekle'ye basmadan: diğer alanlar boşuna doldurulmasın.
    expect(notice(container)?.textContent).toContain("Bu komut zaten favorilerde: “Dev sunucu”.");

    fireEvent.click(getByText("Ekle"));
    expect(addFavorite, "var olan komut yeniden eklendi").not.toHaveBeenCalled();
    expect(formOf(container), "form kapandı, yazılan kayboldu").not.toBeNull();
    expect(field(container, "Kısaltma").value).toBe("yysd");
    // Bildirim balonu değil: uyarının düğmesi var, balon taşıyamıyor.
    expect(useStore.getState().ui.toast).toBeNull();
  });

  it("Mevcut favoriyi düzenle: yazılanlar kaydın üstüne, hazır gelen sekme klasörü değil", async () => {
    const { container, getByText } = render(<FavoritesPanel />);
    newWithExisting(container, getByText);
    expect(field(container, "Klasör").value, "etkin sekmenin klasörü hazır gelmeli").toBe(AKTIF);
    type(container, "Not", "önce npm i");
    fireEvent.change(container.querySelector(".fav-form select")!, { target: { value: "g1" } });

    fireEvent.click(getByText("Mevcut favoriyi düzenle"));

    // Form artık var olan kaydı düzenliyor; uyarının sebebi kalmadı.
    expect(getByText("Kaydet")).toBeTruthy();
    expect(notice(container)).toBeNull();
    expect(field(container, "Komut").value).toBe("yarn start:dev");
    // Yazılanlar taşındı...
    expect(field(container, "Kısaltma").value).toBe("yysd");
    expect(field(container, "Not").value).toBe("önce npm i");
    expect(container.querySelector<HTMLSelectElement>(".fav-form select")!.value).toBe("g1");
    // ...yazılmayanlar kayıttaki gibi. Sekme klasörü taşınsaydı favori listeden
    // çalıştırılınca sessizce başka bir klasöre geçerdi.
    expect(field(container, "Kısa ad").value).toBe("Dev sunucu");
    expect(field(container, "Grup adı").value).toBe("Yataş");
    expect(field(container, "Klasör").value, "sekme klasörü kaydınkini ezdi").toBe("/proje/yatas");

    fireEvent.click(getByText("Kaydet"));
    await waitFor(() => expect(formOf(container), "kayıttan sonra form kapanmalı").toBeNull());
    expect(addFavorite).not.toHaveBeenCalled();
    expect(updateFavorite).toHaveBeenCalledWith("f2", {
      command: "yarn start:dev",
      label: "Dev sunucu",
      note: "önce npm i",
      cwd: "/proje/yatas",
      groupId: "g1",
      folder: "Yataş",
      alias: "yysd",
    });
  });

  it("elle değiştirilen klasör taşınıyor, boşaltılan alan kayıttakini silmiyor", () => {
    const { container, getByText } = render(<FavoritesPanel />);
    newWithExisting(container, getByText);
    type(container, "Klasör", "/baska/yer");
    type(container, "Kısa ad", "   ");

    fireEvent.click(getByText("Mevcut favoriyi düzenle"));
    expect(field(container, "Klasör").value).toBe("/baska/yer");
    expect(field(container, "Kısa ad").value).toBe("Dev sunucu");
  });

  it("klavyeyle: Enter uyarının düğmesine, düğme komut alanına götürüyor", () => {
    const { container, getByText } = render(<FavoritesPanel />);
    newWithExisting(container, getByText);

    fireEvent.keyDown(field(container, "Kısaltma"), { key: "Enter" });
    expect(addFavorite).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe("Mevcut favoriyi düzenle");

    // Düğmede Enter = tıklama. Düğme uyarıyla birlikte kayboluyor; odak
    // sayfaya düşmemeli, düzenlenen kaydın ilk alanına gelmeli.
    fireEvent.click(document.activeElement!);
    expect(document.activeElement).toBe(field(container, "Komut"));
  });

  it("komutu değiştirince uyarı kalkıyor ve yeni komut ekleniyor", async () => {
    const { container, getByText } = render(<FavoritesPanel />);
    newWithExisting(container, getByText);
    type(container, "Komut", "yarn start:prod");
    expect(notice(container)).toBeNull();

    addFavorite.mockResolvedValue(fav("f3", "yarn start:prod", { alias: "yysd" }));
    fireEvent.click(getByText("Ekle"));
    await waitFor(() => expect(formOf(container)).toBeNull());
    expect(addFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ command: "yarn start:prod", alias: "yysd", cwd: AKTIF }),
    );
  });

  it("kaydedilemezse form kapanmıyor", async () => {
    // Rust reddetti (ör. disk yazılamadı): `addFavorite` null döndü, hatayı
    // o gösterdi. Form kapansaydı yazılan yine kaybolurdu.
    const { container, getByText } = render(<FavoritesPanel />);
    fireEvent.click(getByText("+ Favori"));
    type(container, "Komut", "yarn start:prod");
    type(container, "Kısaltma", "ysp");
    fireEvent.click(getByText("Ekle"));
    await waitFor(() => expect(addFavorite).toHaveBeenCalledTimes(1));
    expect(formOf(container), "kaydedilemeyen form kapandı").not.toBeNull();
    expect(field(container, "Kısaltma").value).toBe("ysp");
  });

  it("liste eskiyken Rust reddederse liste tazeleniyor, uyarı formda beliriyor", async () => {
    // Arayüzün listesi eski: `yarn start:dev` başka bir yoldan eklenmiş ama
    // arayüz bilmiyor, ön denetim geçiyor. Rust'ın tek dilli iletisi
    // bildirimde kalıyor; tazelenen liste formun kendi uyarısını getiriyor.
    const guncel = useStore.getState().favorites;
    useStore.setState({ favorites: [guncel[0]], addFavorite: initial.addFavorite });
    const ekle = vi
      .spyOn(api, "favoritesAdd")
      .mockRejectedValue("bu komut zaten favorilerde: yarn start:dev");
    const listele = vi.spyOn(api, "favoritesList").mockResolvedValue(guncel);
    try {
      const { container, getByText } = render(<FavoritesPanel />);
      newWithExisting(container, getByText);
      expect(notice(container), "eski listede uyarı olmamalı").toBeNull();

      fireEvent.click(getByText("Ekle"));
      await waitFor(() => expect(notice(container)?.textContent).toContain("“Dev sunucu”"));
      expect(ekle).toHaveBeenCalledTimes(1);
      expect(formOf(container), "reddedilen kayıttan sonra form kapandı").not.toBeNull();
      expect(field(container, "Kısaltma").value).toBe("yysd");
    } finally {
      ekle.mockRestore();
      listele.mockRestore();
    }
  });
});

describe("düzenlemede komut tekilliği", () => {
  /** Satırın sağ tık menüsünden "Düzenle…". */
  function editRow(c: HTMLElement, title: string) {
    const row = [...c.querySelectorAll<HTMLElement>(".fav-item")].find(
      (el) => el.querySelector(".fav-title")?.firstChild?.textContent === title,
    )!;
    fireEvent.contextMenu(row);
    const item = [...document.querySelectorAll<HTMLButtonElement>(".ctx-menu button.ctx-item")].find(
      (el) => el.querySelector(".ctx-label")?.textContent === "Düzenle…",
    )!;
    fireEvent.click(item);
  }

  it("başka favorinin komutunu almak uyarı veriyor ve kaydetmiyor", () => {
    const { container, getByText } = render(<FavoritesPanel />);
    editRow(container, "npm run build --configuration");
    expect(notice(container), "kendi komutu uyarı vermemeli").toBeNull();

    type(container, "Komut", "yarn start:dev");
    expect(notice(container)?.textContent).toContain("“Dev sunucu”");
    fireEvent.click(getByText("Kaydet"));
    expect(updateFavorite).not.toHaveBeenCalled();

    type(container, "Komut", "npm run build --configuration --prod");
    expect(notice(container)).toBeNull();
  });

  it("eskiden kalan bir çift kaydı kilitlemiyor", async () => {
    // Kural yokken düzenlemeyle oluşmuş iki aynı komut: komutu DEĞİŞMEYEN
    // düzenleme denetlenmiyor (Rust tarafı da öyle).
    useStore.setState({ favorites: [fav("a", "ls"), fav("b", "ls", { label: "Liste" })] });
    const { container, getByText } = render(<FavoritesPanel />);
    editRow(container, "Liste");
    expect(notice(container)).toBeNull();
    type(container, "Not", "uzun biçim");
    fireEvent.click(getByText("Kaydet"));
    await waitFor(() => expect(updateFavorite).toHaveBeenCalledTimes(1));
    expect(updateFavorite).toHaveBeenCalledWith("b", expect.objectContaining({ note: "uzun biçim" }));
  });
});

describe("İngilizce", () => {
  it("uyarı ve düğme çevrilmiş", () => {
    setLanguage("en");
    const { container, getByText } = render(<FavoritesPanel />);
    fireEvent.click(getByText("+ Favorite"));
    fireEvent.change(
      [...formOf(container)!.querySelectorAll<HTMLInputElement>("input")].find((i) =>
        i.placeholder.startsWith("Command"),
      )!,
      { target: { value: "yarn start:dev" } },
    );
    expect(notice(container)?.textContent).toContain("This command is already a favorite: “Dev sunucu”.");
    expect(getByText("Edit the existing favorite")).toBeTruthy();
  });
});
