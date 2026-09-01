import { describe, expect, it } from "vitest";

import { resolveProfile, shellBadge } from "./labels";
import { healTabProfiles } from "./tabs";
import type { Group, Profile, TabState } from "../types";

/**
 * Sekme rozetinde görünen `?`.
 *
 * BİLDİRİLEN HATA: kenar çubuğundaki sekmeler kabuk adı yerine `?` gösteriyor.
 *
 * Sebebi bir çizim hatası değil, iki tarafın aynı soruya farklı cevap
 * vermesiydi. Sekme kabuğunu bir profil KİMLİĞİ ile tutuyor. Kimlik boşa
 * düşünce:
 *
 *   * Rust tarafı (`store::resolve_profile`) varsayılan profile düşüyor ve
 *     sekme sorunsuz açılıyor;
 *   * arayüz ise TAM eşleşme arıyor, bulamıyor ve `shellBadge(undefined)`
 *     çağırıyordu — yani `?`.
 *
 * Kimliğin boşa düşmesi ender bir durum da değil: bir profili silmek ona bağlı
 * bütün sekmeleri, "Ayarları varsayılanlara döndür" ise AÇIK OLAN HER SEKMEYİ
 * aynı anda kopuk bırakıyor (sıfırlama profilleri yeniden tarayıp hepsine yeni
 * kimlik veriyor).
 *
 * Buradaki testler iki tarafı da bağlıyor: `resolveProfile` düşüş sırasını
 * Rust'takiyle aynı yapıyor, `healTabProfiles` de bağı kalıcı olarak onarıyor.
 */

function profile(id: string, kind: Profile["kind"], name = id): Profile {
  return {
    id,
    name,
    kind,
    shell: "",
    args: [],
    cwd: null,
    env: {},
    shellIntegration: true,
    color: null,
    icon: null,
    unavailable: false,
  };
}

function tab(id: string, profileId: string): TabState {
  return {
    id,
    title: "",
    customTitle: null,
    profileId,
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(id: string, tabs: TabState[], defaultProfileId: string | null = null): Group {
  return {
    id,
    name: id,
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId,
    defaultCwd: null,
    env: {},
    activeTabId: tabs[0]?.id ?? null,
    tabs,
  };
}

const PWSH = profile("prof-1", "pwsh", "PowerShell 7");
const CMD = profile("prof-2", "cmd", "Komut İstemi");

describe("profil çözümü", () => {
  it("kimlik eşleşiyorsa o profil", () => {
    expect(resolveProfile([PWSH, CMD], "prof-2", "prof-1")).toBe(CMD);
  });

  it("kimlik boşa düşmüşse varsayılana iner", () => {
    // Silinmiş profile bağlı sekme. Kabuk varsayılanla açılıyor; rozet de
    // onu göstermeli.
    expect(resolveProfile([PWSH, CMD], "silinmis", "prof-2")).toBe(CMD);
  });

  it("varsayılan da boşa düşmüşse listenin ilki", () => {
    // Rust tarafındaki üçüncü basamak. Ayar dosyası bozuksa bile sekme bir
    // kabukla açılıyor.
    expect(resolveProfile([PWSH, CMD], "yok", "o-da-yok")).toBe(PWSH);
  });

  it("profil listesi boşsa tanımsız", () => {
    // Gerçekten bilinmeyen tek durum: makinede hiç kabuk bulunamamış.
    expect(resolveProfile([], "prof-1", "prof-1")).toBeUndefined();
  });
});

describe("kabuk rozeti", () => {
  it("türün kısa kodunu veriyor", () => {
    expect(shellBadge(PWSH)).toBe("PS7");
    expect(shellBadge(CMD)).toBe("CMD");
  });

  it("boşa düşmüş kimlik artık ? üretmiyor", () => {
    // Hatanın kendisi. Çözüm zinciri: kimlik bulunamıyor → varsayılana
    // düşülüyor → rozet varsayılanın kodunu gösteriyor.
    expect(shellBadge(resolveProfile([PWSH, CMD], "silinmis", "prof-1"))).toBe("PS7");
  });

  it("? yalnızca hiç profil yokken çıkıyor", () => {
    expect(shellBadge(resolveProfile([], "prof-1"))).toBe("?");
  });
});

describe("profil bağının onarımı", () => {
  const groups = [
    group("g1", [tab("t1", "prof-1"), tab("t2", "silinmis")], "silinmis"),
    group("g2", [tab("t3", "prof-2")]),
  ];

  it("boşa düşen sekme varsayılana bağlanıyor", () => {
    const healed = healTabProfiles(groups, [PWSH, CMD], "prof-2");
    expect(healed[0].tabs[1].profileId).toBe("prof-2");
  });

  it("sağlam bağlara dokunulmuyor", () => {
    const healed = healTabProfiles(groups, [PWSH, CMD], "prof-2");
    expect(healed[0].tabs[0].profileId).toBe("prof-1");
    expect(healed[1].tabs[0].profileId).toBe("prof-2");
    // Değişmeyen grup nesne kimliğini de koruyor: gereksiz yeniden çizim yok.
    expect(healed[1]).toBe(groups[1]);
  });

  it("grubun varsayılan profili de onarılıyor", () => {
    // Onarılmazsa gruptaki BİR SONRAKİ sekme yine kopuk kimlikle açılırdı.
    const healed = healTabProfiles(groups, [PWSH, CMD], "prof-2");
    expect(healed[0].defaultProfileId).toBe("prof-2");
  });

  it("null varsayılan korunuyor", () => {
    // `null` bir kopuk bağ değil: "uygulamanın varsayılanını kullan" demek.
    const healed = healTabProfiles(groups, [PWSH, CMD], "prof-2");
    expect(healed[1].defaultProfileId).toBe(null);
  });

  it("varsayılan kimlik de geçersizse listenin ilki kullanılıyor", () => {
    const healed = healTabProfiles(groups, [PWSH, CMD], "bu-da-yok");
    expect(healed[0].tabs[1].profileId).toBe("prof-1");
  });

  it("değişiklik yoksa aynı dizi dönüyor", () => {
    const saglam = [group("g", [tab("t", "prof-1")])];
    expect(healTabProfiles(saglam, [PWSH, CMD], "prof-1")).toBe(saglam);
  });

  it("profil listesi boşken hiçbir şey yapılmıyor", () => {
    // Bağlanacak bir şey yok; kimliği silmek bilgiyi tümden atmak olurdu ve
    // profiller geri geldiğinde sekme yanlış kabuğa bağlı kalırdı.
    expect(healTabProfiles(groups, [], "")).toBe(groups);
  });
});
