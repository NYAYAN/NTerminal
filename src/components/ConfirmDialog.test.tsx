// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "../lib/i18n";
import { useStore } from "../store/useStore";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Onay penceresi davranışı.
 *
 * Bu pencerenin doğru çalışması "yanlışlıkla sekme kapatma" korumasının
 * tamamı: görünmezse ya da yanlış cevap dönerse koruma diye bir şey kalmıyor.
 * Bu yüzden yalnızca çizimi değil, kararın çağırana DOĞRU ulaşmasını da
 * test ediyoruz.
 */

function resetUi() {
  const state = useStore.getState();
  useStore.setState({ ui: { ...state.ui, confirm: null } });
}

beforeEach(() => {
  setLanguage("tr");
  resetUi();
});

afterEach(() => {
  cleanup();
  resetUi();
});

describe("onay penceresi", () => {
  it("istek yokken hiçbir şey çizmiyor", () => {
    const { container } = render(<ConfirmDialog />);
    // jest-dom matcher'lari yok; dogrudan DOM'a bakiyoruz.
    expect(container.innerHTML).toBe("");
  });

  it("başlık, ileti ve ayrıntıyı gösteriyor", async () => {
    render(<ConfirmDialog />);
    void useStore.getState().askConfirm({
      title: "Sekmeyi kapat",
      message: '"build" sekmesi kapatılacak.',
      detail: "Kilitleyerek kalıcı olarak koruyabilirsiniz.",
    });
    await act(async () => {});

    expect(screen.getByText("Sekmeyi kapat")).toBeTruthy();
    expect(screen.getByText('"build" sekmesi kapatılacak.')).toBeTruthy();
    expect(screen.getByText("Kilitleyerek kalıcı olarak koruyabilirsiniz.")).toBeTruthy();
  });

  it("onaylayınca true, vazgeçince false dönüyor", async () => {
    render(<ConfirmDialog />);

    const first = useStore.getState().askConfirm({ title: "T", message: "M" });
    await act(async () => {});
    fireEvent.click(screen.getByText("Tamam"));
    expect(await first).toBe(true);

    const second = useStore.getState().askConfirm({ title: "T", message: "M" });
    await act(async () => {});
    fireEvent.click(screen.getByText("Vazgeç"));
    expect(await second).toBe(false);
  });

  it("karardan sonra pencere kapanıyor", async () => {
    const { container } = render(<ConfirmDialog />);
    const answer = useStore.getState().askConfirm({ title: "T", message: "M" });
    await act(async () => {});
    expect(container.querySelector(".modal.confirm")).not.toBe(null);

    fireEvent.click(screen.getByText("Tamam"));
    await answer;
    await act(async () => {});
    expect(container.querySelector(".modal.confirm")).toBe(null);
    expect(useStore.getState().ui.confirm).toBe(null);
  });

  it("Esc vazgeçiyor, Enter onaylıyor", async () => {
    render(<ConfirmDialog />);

    const escaped = useStore.getState().askConfirm({ title: "T", message: "M" });
    await act(async () => {});
    fireEvent.keyDown(window, { key: "Escape" });
    expect(await escaped).toBe(false);

    const entered = useStore.getState().askConfirm({ title: "T", message: "M" });
    await act(async () => {});
    fireEvent.keyDown(window, { key: "Enter" });
    expect(await entered).toBe(true);
  });

  it("örtüye tıklamak vazgeçmek sayılıyor, pencereye tıklamak değil", async () => {
    const { container } = render(<ConfirmDialog />);
    const answer = useStore.getState().askConfirm({ title: "T", message: "M" });
    await act(async () => {});

    // Pencerenin içine tıklamak kapatmamalı: yanlışlıkla onaylamak/vazgeçmek
    // mümkün olmamalı.
    fireEvent.mouseDown(container.querySelector(".modal.confirm")!);
    await act(async () => {});
    expect(useStore.getState().ui.confirm).not.toBe(null);

    fireEvent.mouseDown(container.querySelector(".overlay")!);
    expect(await answer).toBe(false);
  });

  it("onay düğmesi odaklı açılıyor", async () => {
    // Enter'ın ne yapacağı görünür olmalı; ayrıca klavyeyle kullanılabilirlik.
    render(<ConfirmDialog />);
    void useStore.getState().askConfirm({ title: "T", message: "M", confirmLabel: "Kapat" });
    await act(async () => {});
    expect((document.activeElement as HTMLElement)?.textContent).toBe("Kapat");
  });

  it("tehlikeli eylemde onay düğmesi dolgulu ve kırmızı", async () => {
    // Yıkıcı eylem de BİRİNCİL: pencerenin var olma sebebi o eylem. Sessiz
    // kırmızı metin "ikincil" gibi durup Enter'ın ne yapacağını
    // belirsizleştiriyordu.
    const { container } = render(<ConfirmDialog />);
    void useStore.getState().askConfirm({ title: "T", message: "M", danger: true });
    await act(async () => {});
    const ok = container.querySelector(".modal-foot .primary");
    expect(ok, "onay düğmesi birincil olmalı").not.toBe(null);
    expect(ok!.classList.contains("destructive"), "yıkıcı biçim eksik").toBe(true);
  });

  it("yıkıcı olmayan eylemde kırmızı biçim yok", async () => {
    const { container } = render(<ConfirmDialog />);
    void useStore.getState().askConfirm({ title: "T", message: "M" });
    await act(async () => {});
    const ok = container.querySelector(".modal-foot .primary");
    expect(ok).not.toBe(null);
    expect(ok!.classList.contains("destructive")).toBe(false);
  });

  it("özel düğme etiketleri kullanılıyor", async () => {
    render(<ConfirmDialog />);
    void useStore.getState().askConfirm({
      title: "T",
      message: "M",
      confirmLabel: "Sil",
      cancelLabel: "Bırak",
    });
    await act(async () => {});
    expect(screen.getByText("Sil")).toBeTruthy();
    expect(screen.getByText("Bırak")).toBeTruthy();
  });

  it("ikinci istek öncekini iptal ediyor, ilk çağıran asılı kalmıyor", async () => {
    // İki pencereyi üst üste göstermek yerine son istek geçerli. Önemli olan
    // ilk `await`in çözülmesi: çözülmezse onu bekleyen kod (closeTab) sonsuza
    // kadar bekler ve sekme ne kapanır ne de kapanmadığı belli olur.
    render(<ConfirmDialog />);
    const first = useStore.getState().askConfirm({ title: "Birinci", message: "M" });
    await act(async () => {});
    const second = useStore.getState().askConfirm({ title: "İkinci", message: "M" });
    await act(async () => {});

    expect(await first).toBe(false);
    expect(screen.getByText("İkinci")).toBeTruthy();

    fireEvent.click(screen.getByText("Tamam"));
    expect(await second).toBe(true);
  });

  it("dil değişince düğme etiketleri de değişiyor", async () => {
    render(<ConfirmDialog />);
    void useStore.getState().askConfirm({ title: "T", message: "M" });
    await act(async () => {});
    expect(screen.getByText("Vazgeç")).toBeTruthy();

    await act(async () => {
      setLanguage("en");
    });
    expect(screen.getByText("Cancel")).toBeTruthy();
    expect(screen.getByText("OK")).toBeTruthy();
  });
});
