// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";

/**
 * KİLİTLİ SEKMENİN KLASÖRÜ SABİT.
 *
 * ## Bildirilen istek
 *
 * "Bir sekmeye kilitle yaparsam path'i değiştirmemek gerek."
 *
 * Kilit o güne kadar yalnızca KAPATMAYI engelliyordu (`canCloseTab`). Oysa bir
 * sekmeyi kilitlemenin sebebi genelde "burada duruyor, karışma": kilitli bir
 * sekmenin altından klasörün kayması kapanmasından daha sinsi bir kayıp, çünkü
 * sekme yerinde duruyor ve BİR SONRAKİ komut sessizce yanlış klasörde çalışıyor
 * — `rm -rf build`, `git reset --hard` gibi bir komutta bunun bedeli geri
 * alınamaz.
 *
 * Kararın iki yere dağılmaması için klasör değiştirmenin tek yolu depodaki
 * `changeDir`. Bu yüzden test iki şeye ayrı ayrı bakıyor: KARARIN kendisi
 * (kilitliyse reddet) ve çağıranların o karardan GEÇTİĞİ.
 *
 * Kullanıcının kabuğa ELLE yazdığı `cd` kapsam dışı: kilit uygulamanın kendi
 * kararlarını sınırlıyor, kabuğu değil.
 */

function tab(id: string, locked: boolean): TabState {
  return {
    id,
    title: id,
    customTitle: null,
    profileId: "p1",
    cwd: "C:\\proje",
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked,
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

/** `changeDir` oturumdan yalnızca `insertCommand` ve `cwd` istiyor. */
function sahteOturum() {
  return { insertCommand: vi.fn(), cwd: "C:\\proje" } as never;
}

function seed(locked: boolean) {
  const oturum = sahteOturum();
  sessions.clear();
  sessions.set("t1", oturum);
  useStore.setState({
    ready: true,
    groups: [group([tab("t1", locked)])],
    activeGroupId: "g1",
  });
  return oturum as unknown as { insertCommand: ReturnType<typeof vi.fn> };
}

describe("kilitli sekmede klasör değişmiyor", () => {
  beforeEach(() => {
    sessions.clear();
  });

  it("kilitsiz sekmede cd gönderiliyor", () => {
    const oturum = seed(false);
    expect(useStore.getState().changeDir("C:\\baska")).toBe(true);
    expect(oturum.insertCommand).toHaveBeenCalledWith("cd C:\\baska", true);
  });

  it("boşluklu yol tırnaklanıyor", () => {
    // Tırnaksız gönderilen böyle bir yol kabukta iki argümana bölünüyor ve
    // `cd` sessizce yanlış yere gidiyor. Seçici eskiden yolu HER ZAMAN
    // tırnaklıyordu; ortak yol `quoteForShell` ile gerektiğinde tırnaklıyor.
    const oturum = seed(false);
    expect(useStore.getState().changeDir("C:\\yeni klasor")).toBe(true);
    expect(oturum.insertCommand).toHaveBeenCalledWith('cd "C:\\yeni klasor"', true);
  });

  it("kilitli sekmede cd hiç gönderilmiyor", () => {
    const oturum = seed(true);
    expect(useStore.getState().changeDir("C:\\baska")).toBe(false);
    // Sessiz reddetme "bozuk" gibi okunur; kullanıcı NEDEN olmadığını görmeli.
    expect(oturum.insertCommand).not.toHaveBeenCalled();
    expect(useStore.getState().ui.toast?.text ?? "").toMatch(/kilitli/i);
  });

  it("activeTabLocked eski kayıtlarda (alan yok) kilitsiz sayıyor", () => {
    seed(false);
    const eski = tab("t1", false) as Partial<TabState>;
    delete eski.locked;
    useStore.setState({ groups: [group([eski as TabState])] });
    expect(useStore.getState().activeTabLocked()).toBe(false);
  });
});

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("klasör değiştiren yollar changeDir'den geçiyor", () => {
  it("klasör seçici kendi cd'sini yazmıyor", () => {
    const picker = read("src/components/DirPicker.tsx");
    expect(picker, "seçici changeDir'i atlıyor").toMatch(/changeDir\(path\)/);
    // Kendi `cd`'sini yazan bir çağıran kilit denetimini de atlar.
    expect(picker, "elle cd geri gelmiş").not.toMatch(/insertCommand\(`cd/);
  });

  it("favorinin klasörü reddedilince komut çalışmıyor", () => {
    const store = read("src/store/useStore.ts");
    // Komutu yine göndermek onu YANLIŞ klasörde çalıştırmak olurdu:
    // favorinin klasörü bilgi değil, koşul.
    expect(store, "favori reddi görmezden geliniyor").toMatch(
      /if \(!get\(\)\.changeDir\(favorite\.cwd\)\) return;/,
    );
  });
});

/**
 * Kabuğa ELLE yazılan `cd`.
 *
 * `changeDir` yalnızca uygulamanın kendi kararlarını kısıtlıyor; bildirilen
 * ikinci belirti buydu: "cd ile değiştirme yapabiliyorum." Karar
 * `lib/tabs.ts` içinde saf ve testli (`lockedCwdDrift`), burada bakılan şey
 * onun UYGULANDIĞI: `onCwd` kararı sorup sürüklenen değeri sekmeye yazmadan
 * geri dönüyor mu.
 *
 * Neden davranış testi değil: `onCwd` gerçek bir `TerminalSession`
 * kurulumunun içinde, jsdom'da xterm ayağa kalkmıyor.
 */
describe("elle cd geri alınıyor", () => {
  const store = read("src/store/useStore.ts");

  it("onCwd kilit kararını soruyor", () => {
    expect(store, "onCwd kilidi hiç sormuyor").toMatch(/lockedCwdDrift\(current, cwd\)/);
  });

  it("kayma varken sabit klasör geri çağrılıyor", () => {
    const at = store.indexOf("onCwd: (cwd) =>");
    expect(at, "onCwd bulunamadı").toBeGreaterThan(-1);
    const body = store.slice(at, store.indexOf("onCommandStart", at));
    expect(body, "geri çağrı yok").toMatch(/sendCd\(session, geri, \{ quiet: true \}\)/);
    // `return` ŞART: sürüklenen değer `tab.cwd`ye yazılırsa sabit klasör
    // kaybolur ve kilit bir daha hiçbir kaymayı yakalamaz.
    expect(body, "sürüklenen klasör sekmeye yazılıyor").toMatch(
      /sendCd\(session, geri, \{ quiet: true \}\);[\s\S]*?return;/,
    );
  });

  it("geri çağrı odağı komut kutusundan almıyor", () => {
    /*
     * BİLDİRİLEN HATA: "sekme kilitli diyor ve focus komut yaz kısmındaysa
     * gidiyor, tekrardan tıklamak gerekiyor."
     *
     * `insertCommand` sonunda `term.focus()` çağırıyor — kullanıcının seçtiği
     * bir komut için doğru, uygulamanın kendi düzeltmesi için değil. Kural
     * `focusTerminal` içinde zaten vardı (sekme adlandırma kutusu için);
     * `runQuietly` onu kullanıyor.
     */
    const session = read("src/terminal/TerminalSession.ts");
    const at = session.indexOf("runQuietly(command: string)");
    expect(at, "runQuietly yok").toBeGreaterThan(-1);
    const body = session.slice(at, at + 240);
    expect(body, "odak kuralı atlanıyor").toMatch(/this\.focusTerminal\(\)/);
    expect(body, "koşulsuz odak geri gelmiş").not.toMatch(/this\.term\.focus\(\)/);
  });

  it("kilitlerken sabit klasör oturumdan tazeleniyor", () => {
    // `tab.cwd` kabuğun bildirdiğinin gerisindeyse kilit, kullanıcının
    // EKRANDA gördüğü klasörü değil eski bir yolu sabitler.
    expect(store, "kilitleme klasörü tazelemiyor").toMatch(
      /locked: !tab\.locked, cwd/,
    );
  });
});
