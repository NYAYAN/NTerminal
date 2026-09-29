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
