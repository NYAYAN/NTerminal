/**
 * Terminal ölçüsünün PTY'ye gidebilecek alt sınırı.
 *
 * ## Ölçülen hata
 *
 * BİLDİRİLEN BELİRTİ: "Terminal aç kapa yaptığımda bazen" istem satırı ikişer
 * harflik parçalara bölünmüş, aralarında artan boşluklar ve tire dizileriyle
 * kalıyor:
 *
 *     ny---------------      --   ---------------an---------------   ...
 *     ny            ay                        an                     ...
 *
 * Diskteki kaydırma tamponu (`scrollback/tab-*.ansi`) sebebi gösterdi: her
 * satır `ny` + 60 boş hücre ve bir sonraki satıra SARILMIŞ; 16 parça
 * (`ny ay an @N … ro ␠N Te`), istemin geri kalanı silinmiş.
 *
 * KÖK NEDEN: iki taraf ayrı alt sınır uyguluyordu.
 *
 *  - FitAddon dar bir kapta en az 2 sütun öneriyor ve xterm'i 2 sütuna
 *    indiriyor. Gruplar (296px) + dosya sütunu (632px) + sağ panel (720px)
 *    açıkken terminale birkaç on piksel kalıyor — tam bu aralık.
 *  - Rust (`pty.rs`) PTY'yi `cols.max(10)` ile EN AZ 10 sütun yapıyor.
 *
 * Yani xterm 2, kabuk 10 sütun sanıyordu. zsh istemi 10 sütuna göre yazdı,
 * xterm 2'de sardı (21 satır). Kap genişleyince xterm imlecin bulunduğu
 * sarılmış satırları BİLEREK yeniden akıtmıyor ("program düzeltir"), zsh da
 * SIGWINCH'te kendi hesabıyla yalnızca 4 satır yukarı çıkıp sildi
 * (`ESC[4A ESC[J`). Üstteki 16 parça ekranda kaldı. Kayıt sırasında
 * SerializeAddon bu "sonu boş ama sarılmış" satırları sarılmayı ZORLAYAN tire
 * dizileriyle yazıyor (`'-'.repeat(n)` + geri sil); geri yükleme başka
 * genişlikte olunca tireler ve boşluklar silinmeden kalıyor.
 *
 * ## Kural
 *
 * Önerilen ölçü PTY'nin alt sınırının altındaysa HİÇ boyutlandırma: xterm de
 * PTY de son geçerli ölçüde kalıyor. Kap o kadar daraldığında terminal zaten
 * okunamaz; eski ölçüde kalıp kırpılması, kabuğu iki sütunluk bir ekrana
 * yeniden çizdirmekten iyi — kap genişleyince hiçbir şey değişmemiş oluyor.
 *
 * Sınırlar Rust'takilerle AYNI olmalı (bkz. `ptySize.test.ts`): xterm bunların
 * altına inemezse iki tarafın ölçüsü her zaman aynı.
 */
export const MIN_PTY_COLS = 10;
export const MIN_PTY_ROWS = 2;

export interface TermSize {
  cols: number;
  rows: number;
}

/**
 * Terminal önerilen ölçüye boyutlandırılmalı mı?
 *
 * Hayır dediği durumlar: öneri yok ya da sayı değil (kap henüz düzenlenmemiş),
 * PTY'nin alt sınırının altında, ya da ölçü zaten aynı.
 */
export function shouldResize(proposed: TermSize | undefined, current: TermSize): boolean {
  if (!proposed || !Number.isFinite(proposed.cols) || !Number.isFinite(proposed.rows)) {
    return false;
  }
  if (proposed.cols < MIN_PTY_COLS || proposed.rows < MIN_PTY_ROWS) return false;
  return proposed.cols !== current.cols || proposed.rows !== current.rows;
}
