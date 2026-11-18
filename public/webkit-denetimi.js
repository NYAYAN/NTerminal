// Eski WebKit denetimi: modül paketinden ÖNCE, sıradan (modül olmayan) bir
// script olarak koşuyor ve bilerek eski sözdizimiyle yazılı.
//
// macOS'ta arayüzü sistemin WebKit'i (Safari'nin motoru) çalıştırıyor. Çok eski
// WebKit (Safari 16.4 öncesi) regex lookbehind'ı tanımıyor; paket ya hiç
// yüklenmiyor ya da sözdizimi hatası veriyor ve kullanıcı yalnızca koyu
// pencere zeminini görüyor. Siyah ekran yerine ne yapılacağını söyle.
// CSP satır içi script'e izin vermediği için ayrı dosya.
(function () {
  var destekli = true;
  try {
    new RegExp("(?<!a)b");
  } catch (e) {
    destekli = false;
  }
  if (destekli) return;

  document.addEventListener("DOMContentLoaded", function () {
    document.body.innerHTML =
      '<div style="font:14px/1.6 -apple-system,sans-serif;color:#e6e6e6;background:#16171a;' +
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:32px">' +
      '<div style="max-width:460px">' +
      '<h1 style="font-size:18px;margin:0 0 12px">N-Terminal bu Mac’teki Safari sürümüyle açılamıyor</h1>' +
      "<p style=\"margin:0 0 12px\">Uygulama ekranını Safari’nin motoru çiziyor ve en az " +
      "<b>Safari 16.4</b> gerekiyor.</p>" +
      "<p style=\"margin:0\"><b>Sistem Tercihleri › Yazılım Güncelleme</b>’den macOS’u ve " +
      "Safari’yi güncelleyip N-Terminal’i yeniden açın.</p>" +
      "</div></div>";
    document.body.style.background = "#16171a";
  });
})();
