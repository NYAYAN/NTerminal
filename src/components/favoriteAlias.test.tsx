// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { Favorite } from "../types";
import { FavoritesPanel } from "./FavoritesPanel";

/**
 * Favori formunda kısaltma: kaydetmeden önce denetleniyor, satırda görünüyor.
 *
 * Rust tarafı aynı kuralları uyguluyor (`favorites.rs`); formun işi hatayı
 * kullanıcının dilinde ve formu kapatmadan göstermek — yazılan komut
 * kaybolmasın.
 */

function fav(id: string, command: string, alias: string | null): Favorite {
  return {
    id,
    command,
    label: null,
    note: null,
    groupId: null,
    folder: null,
    cwd: null,
    alias,
    createdAt: 0,
    usedCount: 0,
    lastUsedAt: null,
  };
}

const addFavorite = vi.fn(async () => null);
const initial = useStore.getState();

beforeEach(() => {
  setLanguage("tr");
  addFavorite.mockClear();
  useStore.setState({
    ready: true,
    groups: [],
    activeGroupId: null,
    favorites: [fav("f1", "npm run build --configuration", "nrb")],
    addFavorite,
    ui: { ...initial.ui, toast: null },
  } as never);
});

afterEach(() => {
  cleanup();
  useStore.setState({ favorites: [], addFavorite: initial.addFavorite, ui: initial.ui });
});

/** "+ Favori" ile formu açar, komutu ve kısaltmayı yazar, "Ekle"ye basar. */
function addWith(container: HTMLElement, getByText: (t: string) => HTMLElement, alias: string) {
  fireEvent.click(getByText("+ Favori"));
  const form = container.querySelector(".fav-form")!;
  const input = (placeholder: string) =>
    [...form.querySelectorAll<HTMLInputElement>("input")].find((i) => i.placeholder.startsWith(placeholder))!;
  fireEvent.change(input("Komut"), { target: { value: "yarn build" } });
  fireEvent.change(input("Kısaltma"), { target: { value: alias } });
  fireEvent.click(getByText("Ekle"));
}

describe("favori kısaltması", () => {
  it("satırda kısaltma rozeti var", () => {
    const { container } = render(<FavoritesPanel />);
    expect(container.querySelector(".fav-alias")?.textContent).toBe("nrb");
  });

  it("başka favorinin kısaltması: hata, form açık, kayıt yok", () => {
    const { container, getByText } = render(<FavoritesPanel />);
    addWith(container, getByText, "nrb");
    expect(useStore.getState().ui.toast?.text).toContain("npm run build --configuration");
    expect(addFavorite).not.toHaveBeenCalled();
    expect(container.querySelector(".fav-form"), "form kapandı, yazılan kayboldu").not.toBeNull();
  });

  it("boşluklu kısaltma: hata, kayıt yok", () => {
    const { container, getByText } = render(<FavoritesPanel />);
    addWith(container, getByText, "y b");
    expect(useStore.getState().ui.toast?.text).toMatch(/tek sözcük/);
    expect(addFavorite).not.toHaveBeenCalled();
  });

  it("geçerli kısaltma kırpılarak kaydediliyor", () => {
    const { container, getByText } = render(<FavoritesPanel />);
    addWith(container, getByText, "  yb  ");
    expect(addFavorite).toHaveBeenCalledWith(expect.objectContaining({ command: "yarn build", alias: "yb" }));
  });

  it("listede kısaltmayla aranabiliyor", () => {
    useStore.setState({
      favorites: [fav("f1", "npm run build --configuration", "nrb"), fav("f2", "yarn start:dev", "ysd")],
    });
    const { container } = render(<FavoritesPanel />);
    const search = container.querySelector<HTMLInputElement>(".panel-controls input")!;
    fireEvent.change(search, { target: { value: "ysd" } });
    const titles = [...container.querySelectorAll(".fav-title")].map((e) => e.firstChild?.textContent);
    expect(titles).toEqual(["yarn start:dev"]);
  });
});
