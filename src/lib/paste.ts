/**
 * Yapıştırılan metinden denetim karakterlerini ayıklar.
 *
 * ## Açık
 *
 * Kabuk yapıştırılan metni iki işaret arasında alıyor (bracketed paste:
 * `ESC[200~` … `ESC[201~`) ve aradaki satır sonlarını ÇALIŞTIRMIYOR; metin
 * satıra konuyor, Enter'a kullanıcı basıyor. Sarmalamayı xterm yapıyor ama
 * metnin İÇİNE bakmıyor (6.0.0, `bracketTextForPaste`). Panodaki metin bitiş
 * işaretini kendi içinde taşırsa yapıştırma orada bitiyor ve gerisi klavyeden
 * yazılmış sayılıyor: ardından gelen satır sonu Enter.
 *
 * YENİDEN ÜRETİLDİ (zsh, PTY düzeneği): panoda
 * `echo guvenli ESC[201~ ⏎ echo SIZDI ⏎` varken yapıştırmak, Enter'a
 * basılmadan `echo SIZDI`yı çalıştırdı. Böyle bir metni panoya bir web
 * sayfası koyabilir; kopyalanan şey ekranda masum görünüyor.
 *
 * ## Kural
 *
 * Sekme ve satır sonları kalıyor; geri kalan C0 (ESC dahil), DEL ve C1
 * (`\x9b` tek baytlık CSI) atılıyor. ESC gidince işaretten geriye `[201~`
 * düz metni kalıyor. xterm (`disallowedPasteControls`), iTerm2 ve kitty de
 * yapıştırmada denetim karakterlerini geçirmiyor.
 *
 * Komut kutusuna giden metin de buradan geçiyor: kutu görünmeyen karakteri
 * çizmiyor ama Enter'da kabuğa olduğu gibi yazıyor; `Ctrl+U` (`\x15`) taşıyan
 * bir metin kutuda `echo iyi kotu` görünüp kabukta yalnızca `kotu`yu
 * çalıştırırdı.
 *
 * Kapsam dışı: bracketed paste'i açmayan kabukta (cmd, bash 3.2) çok satırlı
 * metin satır satır çalışıyor. Bu her terminalde böyle; kural onu değiştirmiyor.
 */
export function sanitizePaste(text: string): string {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
}
