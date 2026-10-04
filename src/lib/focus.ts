/**
 * Kullanıcı terminalin DIŞINDA bir metin kutusuna mı yazıyor?
 *
 * Odağı kendiliğinden taşıyan her yol buna bakıyor: `TerminalSession`
 * (`focusTerminal`) ve komut kutusunun kip etkisi (`CommandInput`). Kural tek
 * yerde, çünkü iki kez ödendi ve iki kopya ayrışmaya yatkın:
 *
 *  - Sekme adlandırma: çift tıklayınca kutu açılıyor, hemen ardından (sekme
 *    ilk kez açılıyorsa kabuk başlatıldıktan sonra, asenkron olarak) terminal
 *    odağı alıyor, kutu `onBlur` ile kapanıp kaydediyordu.
 *  - Dizin seçici: seçilen klasöre `cd` gerçek bir komut olarak gidiyor ve
 *    seçici açık kalıyor. Komut başlayıp bitince komut kutusunun etkisi odağı
 *    önce terminale, sonra kutuya alıyordu — seçicinin arama kutusundan.
 *    BİLDİRİLEN: "yön tuşları ile klasör seçip enter basınca o klasör dizinine
 *    gidiyor, sonrasında yön tuşları ile seçim yapmaya devam edemiyorum."
 *
 * xterm girdiyi kendi gizli textarea'sı üzerinden alıyor; orası "başka yerde
 * yazıyor" sayılmıyor.
 */
export function typingOutsideTerminal(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return false;
  const isFormField =
    active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT";
  return isFormField && !active.closest(".xterm");
}

/**
 * Sayfada — terminalin ve komut kutusunun DIŞINDA — seçili metin; yoksa boş.
 *
 * BİLDİRİLEN: Değişiklikler panelindeki git hata kutusunun metni seçilip
 * Cmd+C yapılınca kopyalanmıyordu. Uygulamanın genel kısayolu kopyalamayı
 * her yerde TERMİNALİN seçimine yönlendiriyordu; sayfadaki seçim panoya hiç
 * gitmiyordu (bkz. `App` kısayol işleyicisi).
 *
 * Terminal ve komut kutusu hariç: ikisinin kendi kopyalama kararı var
 * (xterm'in seçimi DOM seçimi değil; kutu `CommandInput.onKeyDown`'da). Metin
 * kutularındaki seçim de burada sayılmıyor — işleyici odak bir metin
 * kutusundayken zaten hiç çalışmıyor ve tarayıcı kendisi kopyalıyor.
 */
export function pageSelectionText(): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";
  const node = selection.anchorNode;
  const element = node instanceof Element ? node : (node?.parentElement ?? null);
  if (element?.closest(".xterm, .command-input")) return "";
  return selection.toString();
}

/**
 * Tarayıcının KENDİ kopyalama tuşu mu: mac'te Cmd+C, diğerlerinde Ctrl+C.
 *
 * Ayarlanabilir kopyalama kısayolundan (`keys.copy`) ayrı bir soru: Windows'ta
 * o Ctrl+Shift+C ve tarayıcıda karşılığı yok — o tuşta seçimi uygulama
 * kendisi yazmalı, bu tuşta yoldan çekilmesi yeterli.
 */
export function isNativeCopyKey(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
  mac: boolean,
): boolean {
  if (event.key.toLowerCase() !== "c" || event.shiftKey || event.altKey) return false;
  return mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}
