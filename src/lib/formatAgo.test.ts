import { describe, expect, it } from "vitest";

import { formatAgo } from "./format";

describe("geçen süre", () => {
  const simdi = new Date(2026, 10, 9, 23, 0, 0).getTime();
  const dk = 60_000;
  const sa = 60 * dk;
  const gun = 24 * sa;
  const once = (ms: number) => formatAgo(simdi - ms, simdi);

  it("birim süreye göre büyüyor ve aşağı yuvarlanıyor", () => {
    expect(once(0)).toBe("az önce");
    expect(once(59_000)).toBe("az önce");
    expect(once(dk)).toBe("1 dk önce");
    expect(once(59 * dk + 59_000)).toBe("59 dk önce");
    expect(once(sa)).toBe("1 sa önce");
    expect(once(2 * sa - 1)).toBe("1 sa önce");
    expect(once(23 * sa + 59 * dk)).toBe("23 sa önce");
    expect(once(gun)).toBe("1 gün önce");
    expect(once(29 * gun)).toBe("29 gün önce");
    expect(once(30 * gun)).toBe("1 ay önce");
    expect(once(364 * gun)).toBe("12 ay önce");
    expect(once(365 * gun)).toBe("1 yıl önce");
    expect(once(800 * gun)).toBe("2 yıl önce");
  });

  it("zaman yoksa boş, saat ileri kaydıysa (gelecekteki kayıt) 'az önce'", () => {
    expect(formatAgo(0, simdi)).toBe("");
    expect(formatAgo(simdi + 5 * dk, simdi)).toBe("az önce");
  });
});
