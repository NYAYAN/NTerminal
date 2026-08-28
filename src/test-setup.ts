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
