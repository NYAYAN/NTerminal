import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Ayarlardaki açılır menülerin genişliği (Premium ve Kokpit).
 *
 * İSTEK: "Ayarlardaki combobox/selectbox'ların genişliğini standart bir
 * genişlik belirle, bu sayede bütünlük olsun." Menüler içerik kadar
 * genişliyordu: WebKit'te ölçülen 132-264px, her satırda başka boy ve en uzun
 * seçenekler (292px) kesik. Klasik tasarımda hepsi zaten 280px.
 *
 * Ölçüm tarayıcı gerektiriyor (jsdom yerleşim yapmıyor); burada bağlanan şey
 * kural: satırlardaki menülerin SABİT genişliği ve formlardakilerin bunun
 * dışında kalması.
 */
const CSS = readFileSync(join(process.cwd(), "src/styles/premium.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function ruleBody(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `CSS kuralı bulunamadı: ${selector}`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf("}", at));
}

const SETTINGS = ':root[data-design="premium"] .modal.settings .modal-body';

describe("ayarlardaki açılır menüler", () => {
  it("satırlarda hepsi aynı genişlikte; dar pencerede sütuna sığıyor", () => {
    const body = ruleBody(`${SETTINGS} > .section > .field > select`);
    // 25rem en uzun seçeneği alıyor: 12px kökte 300px.
    expect(body).toMatch(/(?:^|[\s;{])width:\s*25rem;/);
    expect(body).toMatch(/max-width:\s*100%;/);
  });

  it("genişliği içeriğe bırakan bir alt/üst sınır kalmadı", () => {
    // Genel menü kuralı genişlik vermiyor; varsa satır kuralıyla yarışırdı.
    const body = ruleBody(`${SETTINGS} select`);
    expect(body).not.toMatch(/(?:^|[\s;{])width:/);
  });

  it("profil ve grup formlarındaki menüler kapsam dışında", () => {
    // Formda menü, yanındaki metin kutularıyla aynı sütunu dolduruyor.
    const body = ruleBody(':root[data-design="premium"] .modal.settings .settings-form select');
    expect(body).toMatch(/max-width:\s*none;/);
    expect(body).not.toMatch(/(?:^|[\s;{])width:/);
  });
});
