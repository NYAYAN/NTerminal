/**
 * Test ortamı yamaları.
 *
 * jsdom tarayıcı API'lerinin tamamını sağlamıyor. Buradaki eksikler ürün
 * hatası değil ortam eksiği: arayüz bunları gerçek WebView2'de kullanıyor,
 * jsdom'da yoklukları testi "çalışmıyor" gibi düşürüyor.
 */

// Sekme çubuğu etkin sekmeyi görünür alana kaydırıyor (klavyeyle sekme
// değiştirirken çubuğun kayması için). jsdom'da tanımlı değil.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

/*
 * `ResizeObserver` jsdom'da YOK.
 *
 * Arayüzde üç yerde kullanılıyor ve üçü de ölçüme dayanan bir kararı tazeliyor:
 * durum çubuğunun sığdırması, terminalin `fit` hesabı ve öneri panelinin
 * yerleşimi. Yokluğunda bileşen çizilirken `ReferenceError` atıyor — yani test
 * ürünün değil ortamın eksiği yüzünden düşüyor.
 *
 * Sahte HİÇBİR ŞEY BİLDİRMİYOR ve bu bilinçli: jsdom düzen hesabı yapmıyor,
 * dolayısıyla bildirilecek gerçek bir ölçü de yok. Ölçüme dayanan kararların
 * kendisi saf işlevlerde test ediliyor (`lib/statusFit.ts`, `lib/anchor.ts`).
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
