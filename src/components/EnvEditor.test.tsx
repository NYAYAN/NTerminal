// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { useStore } from "../store/useStore";
import { EnvEditor } from "./EnvEditor";

/**
 * Ortam değişkeni düzenleyici.
 *
 * Satır silme buradaki tek yıkıcı işlem ve satır anında kaydediliyor — geri
 * alma yok. Kullanıcının kuralı ("her silmede sor") burada da geçerli; ayrıca
 * satırdaki `×` tam olarak yanlışlıkla basılan türden küçük bir düğme.
 */

let answer = true;
let asked: string[] = [];

beforeEach(() => {
  setLanguage("tr");
  answer = true;
  asked = [];
  useStore.setState({
    askConfirm: async (request) => {
      asked.push(request.message);
      return answer;
    },
  });
});

afterEach(cleanup);

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("ortam değişkeni silme", () => {
  it("satırları çiziyor", () => {
    const { container } = render(<EnvEditor value={{ A: "1", B: "2" }} onChange={() => {}} />);
    expect(container.querySelectorAll(".pair")).toHaveLength(2);
  });

  it("silme onay soruyor ve değişken adını gösteriyor", async () => {
    const onChange = vi.fn();
    const { container } = render(<EnvEditor value={{ NODE_ENV: "dev" }} onChange={onChange} />);
    fireEvent.click(container.querySelector(".pair .danger")!);
    await settle();

    expect(asked).toHaveLength(1);
    expect(asked[0], "hangi değişkenin silindiği görünmeli").toContain("NODE_ENV");
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("vazgeçince satır kalıyor", async () => {
    const onChange = vi.fn();
    answer = false;
    const { container } = render(<EnvEditor value={{ A: "1" }} onChange={onChange} />);
    fireEvent.click(container.querySelector(".pair .danger")!);
    await settle();

    expect(asked).toHaveLength(1);
    expect(onChange, "vazgeçilmesine rağmen silindi").not.toHaveBeenCalled();
    expect(container.querySelectorAll(".pair")).toHaveLength(1);
  });

  it("adsız satırda da soruyor", async () => {
    // Yeni eklenip henüz adlandırılmamış satır: soru yine sorulmalı ama
    // "adsız" denmeli, boş bir ad göstermek anlamsız.
    const { container } = render(<EnvEditor value={{}} onChange={() => {}} />);
    fireEvent.click(container.querySelector(".outline")!); // + Değişken ekle
    await settle();
    fireEvent.click(container.querySelector(".pair .danger")!);
    await settle();

    expect(asked).toHaveLength(1);
    expect(asked[0]).toBe("Adsız ortam değişkeni silinecek.");
  });

  it("değişken eklemek soru sormuyor", async () => {
    const { container } = render(<EnvEditor value={{}} onChange={() => {}} />);
    fireEvent.click(container.querySelector(".outline")!);
    await settle();
    expect(asked).toEqual([]);
    expect(container.querySelectorAll(".pair")).toHaveLength(1);
  });
});
