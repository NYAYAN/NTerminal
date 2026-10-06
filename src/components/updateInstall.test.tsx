// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { useStore, type UpdateInstall } from "../store/useStore";
import type { ReleaseInfo } from "../types";
import { SettingsDialog } from "./SettingsDialog";

/**
 * Ayarlar › Hakkında'daki "Güncelle ve yeniden başlat".
 *
 * Düğme yalnızca uygulama sürümü KENDİSİ kurabildiğinde var (`installable`);
 * yoksa tek yol indirme sayfası ve o zaman birincil düğme o. Kurulum
 * sürerken düğme Commit/Push'la aynı dili konuşuyor: yazı sabit, yanında
 * çark, ilerleme altında — yazıyı "İndiriliyor %42" yapmak düğmenin
 * genişliğini her yüzdede değiştirirdi.
 */

const YENI: ReleaseInfo = {
  version: "0.3.0",
  url: "https://example/r/0.3.0",
  notes: "",
  installable: true,
};

async function openAbout(update: ReleaseInfo, install: UpdateInstall = { phase: "idle" }) {
  const state = useStore.getState();
  useStore.setState({
    update,
    updateInstall: install,
    ui: { ...state.ui, settingsOpen: true, settingsSection: "about" },
  });
  const view = render(<SettingsDialog />);
  await act(async () => {});
  return view.container;
}

const installButton = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>("button.update-install");

const pageButton = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === "İndirme sayfasını aç",
  )!;

beforeEach(() => {
  setLanguage("tr");
});

afterEach(() => {
  cleanup();
  const state = useStore.getState();
  useStore.setState({
    update: null,
    updateInstall: { phase: "idle" },
    ui: { ...state.ui, settingsOpen: false, settingsSection: null },
  });
});

describe("güncelle ve yeniden başlat", () => {
  it("kurulamayan sürümde düğme yok, indirme sayfası birincil", async () => {
    const root = await openAbout({ ...YENI, installable: false });
    expect(installButton(root), "imzasız yayında kurulum düğmesi çıktı").toBe(null);
    expect(pageButton(root).className).toBe("primary");
  });

  it("kurulabilen sürümde düğme birincil, indirme sayfası ikincil", async () => {
    const root = await openAbout(YENI);
    expect(installButton(root)?.textContent).toBe("Güncelle ve yeniden başlat");
    expect(installButton(root)?.className).toContain("primary");
    expect(pageButton(root).className).toBe("outline");
  });

  it("basmak kurulumu başlatıyor", async () => {
    const installUpdate = vi.fn(async () => {});
    const original = useStore.getState().installUpdate;
    useStore.setState({ installUpdate });
    const root = await openAbout(YENI);
    fireEvent.click(installButton(root)!);
    expect(installUpdate).toHaveBeenCalledTimes(1);
    useStore.setState({ installUpdate: original });
  });

  it("indirilirken çark, sabit yazı ve altta yüzde", async () => {
    const root = await openAbout(YENI, { phase: "downloading", received: 42, total: 100 });
    const button = installButton(root)!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector(".spinner"), "çark yok").not.toBe(null);
    expect(button.textContent, "düğmenin yazısı değişti").toBe("Güncelle ve yeniden başlat");
    expect(root.querySelector(".update-progress")?.textContent).toBe("İndiriliyor… %42");
    expect(button.title).toBe("İndiriliyor… %42");
  });

  it("boyutu bilinmeyen indirmede yüzde uydurulmuyor", async () => {
    const root = await openAbout(YENI, { phase: "downloading", received: 42, total: null });
    expect(root.querySelector(".update-progress")?.textContent).toBe("İndiriliyor…");
  });

  it("kurulum aşamasında yeniden başlatıldığını söylüyor", async () => {
    const root = await openAbout(YENI, { phase: "restarting" });
    expect(installButton(root)!.disabled).toBe(true);
    expect(root.querySelector(".update-progress")?.textContent).toBe("Yeniden başlatılıyor…");
  });

  it("boştayken çark ve ilerleme yok", async () => {
    const root = await openAbout(YENI);
    expect(installButton(root)!.querySelector(".spinner")).toBe(null);
    expect(root.querySelector(".update-progress")).toBe(null);
  });

  it("hata satırı neyin düştüğünü ve elle yolu söylüyor; düğme yeniden denenebilir", async () => {
    const root = await openAbout(YENI, { phase: "failed", error: "imza doğrulanamadı" });
    const row = root.querySelector(".update-failed")!;
    expect(row.textContent).toContain("Güncelleme kurulamadı");
    expect(row.textContent).toContain("imza doğrulanamadı");
    expect(installButton(root)!.disabled).toBe(false);
  });
});
