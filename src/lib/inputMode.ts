/**
 * Tuş vuruşları nereye gidiyor: uygulamanın girdi kutusuna mı, doğrudan
 * kabuğa mı?
 *
 * ## Neden üç kip var
 *
 * İstenen davranış Warp'ınki: komut satırı terminalin ızgarasının dışında,
 * pencerenin dibinde sabit duran bir kutu. Yazdıklarınız kabuğa ancak Enter'a
 * bastığınızda gidiyor. Böylece kaydırma satırı oynatmıyor, satır ekranın bir
 * parçası olmadığı için de kaybolmuyor. Bu `app` kipi.
 *
 * Komut ÇALIŞIRKEN kutu eskiden kapanıyor, tuşlar doğrudan terminale
 * gidiyordu. BİLDİRİLEN: "`ng serve` 'Would you like to use a different port?
 * (Y/n)' diye soruyor; cevabı komut yazma kısmına yazamıyoruz, mesajın çıktığı
 * yere yazıyoruz." Kullanıcı için yazılan yer TEK olmalı: soruyu kabuk da
 * sorsa çalışan program da sorsa yanıt aynı kutuya yazılıyor. Bu `stdin`
 * kipi: satır kutuda toplanıyor, Enter'la çalışan programın girdisine gidiyor.
 *
 * Satırı Enter'a kadar tutmak terminalin zaten yaptığı şey: kanonik kipte
 * (y/n soruları, `Read-Host`, `input()`) sürücü de girdiyi Enter'a kadar
 * biriktirip öyle veriyor. Tuşları BİR BİR isteyen programlar için kutu
 * BOŞKEN tuşlar doğrudan geçiyor (`stdinKeyAction`): oklar ve Enter seçim
 * listelerini, Boşluk işaret kutularını, Ctrl tuşları programın kendi
 * kısayollarını sürüyor. Bedeli yazarak süzülen listelerde: süzgeç metni
 * programa Enter'la birlikte ulaşıyor, yazarken değil.
 *
 * Girdiyi uygulamanın toplaması HİÇ olmayacak yer tam ekran programlar:
 * `vim`, `less`, `git rebase -i`'nin açtığı düzenleyici — ekranı program
 * yönetiyor ve her tuş o an bir komut. Bunlar ikincil ekran tamponuna geçiyor
 * ve orada kip `raw`: tuşlar doğrudan terminale.
 *
 * Bu yüzden kip, kabuğun ne yaptığına bakarak seçiliyor. Karar burada, saf bir
 * işlevde: gerçek terminalde denemesi zor (doğru anda doğru program çalışıyor
 * olmalı), ama girdiği sinyaller net.
 *
 * ## Sinyaller
 *
 * `atPrompt` kabuk entegrasyonundan geliyor (OSC 133): `B` "komut girişi
 * başlıyor", `C` "komut çalışmaya başladı". Yani kabuk sizi beklerken true,
 * bir komut çalışırken false.
 *
 * `running` de entegrasyondan: `C` ile birlikte komut metni geldiğinde açılıyor,
 * `D` (komut bitti) ile kapanıyor.
 *
 * `altScreen` xterm'den: tam ekran programlar (vim, less, htop) ikincil ekran
 * tamponuna geçiyor. Entegrasyon sinyali gecikse bile bu yakalıyor.
 */
export type InputMode = "app" | "stdin" | "raw";

export interface InputSignals {
  /** Ayar açık mı (kullanıcı klasik terminale dönebilmeli). */
  enabled: boolean;
  /** Kabuk entegrasyonu bu sekmede çalışıyor mu. */
  integration: boolean;
  /** Kabuk istemde bekliyor mu (OSC 133;B geldi, 133;C gelmedi). */
  atPrompt: boolean;
  /** İkincil ekran tamponu etkin mi (vim, less, htop). */
  altScreen: boolean;
  /** Bir komut çalışıyor mu (OSC 133;C geldi, 133;D gelmedi). */
  running: boolean;
  /**
   * Kabuk süreci bitti mi.
   *
   * BİLDİRİLEN HATA: "'Bu sekmedeki kabuk kapandı' diyor ama altta komut
   * yazın kısmı aktif."
   *
   * Sebep şuydu: `atPrompt` kabuğun BİLDİRDİĞİ bir durum ve kabuk ölürken
   * "artık istemde değilim" diye bir şey bildirmiyor — son bildirdiği değer
   * neyse o kalıyor. Kutu da o değere bakıp açık duruyordu. Yazılan her şey
   * olmayan bir sürece gidiyor, yani kutu çalışıyormuş gibi görünüp hiçbir
   * şey yapmıyordu.
   *
   * Ölüm sinyali bu yüzden ayrı ve KABUĞUN BİLDİRİMİNDEN bağımsız: süreç
   * bittiğinde uygulama bunu doğrudan biliyor (PTY exit olayı).
   */
  exited: boolean;
}

/**
 * Kipi seçer.
 *
 * Sıralama önemli ve hepsi "hayır"a çalışıyor: kuşkulu her durumda HAM kip
 * kazanıyor. Sebep asimetrik: yanlışlıkla ham kipte kalmak yalnızca eski
 * davranışı verir (satır terminalde çizilir), yanlışlıkla uygulama kipinde
 * kalmak ise çalışan programa tuş ulaşmamasına yol açar — kullanıcı `vim`
 * içinde kilitlenir.
 */
export function resolveInputMode(signals: InputSignals): InputMode {
  if (!signals.enabled) return "raw";
  // Kabuk öldüyse yazılacak bir yer yok. En başta: aşağıdaki koşulların hepsi
  // kabuğun BİLDİRDİĞİ duruma bakıyor ve ölü bir kabuk artık bildirmiyor.
  if (signals.exited) return "raw";
  // Entegrasyon yoksa `atPrompt` hiç gelmiyor; kutu sonsuza kadar kapalı
  // kalırdı. cmd, entegrasyonu kapatılmış profil ve eski kabuklar buraya
  // düşüyor.
  if (!signals.integration) return "raw";
  if (signals.altScreen) return "raw";
  if (signals.atPrompt) return "app";
  /*
   * Komut çalışıyor: kutu açık, satır ÇALIŞAN PROGRAMA gidiyor.
   *
   * Kilitlenme riski burada yok, asimetri kuralı bozulmuyor: tuşlar programa
   * yine ulaşıyor (satır Enter'la, boş kutuda tuşlar anında) ve Ctrl+C her
   * zaman geçiyor. Tam ekran programı yukarıdaki `altScreen` dalı zaten
   * ayırdı.
   *
   * İkisinin de yanlış olduğu aralıklar HAM kalıyor: kabuk ilk istemine
   * gelmedi ya da komut bitti ama yeni istem henüz çiziliyor (133;D ile
   * 133;B arası). Orada kutuya yazılanı alacak kimse yok.
   */
  if (signals.running) return "stdin";
  return "raw";
}

/**
 * Kabuğa gönderilen kesme baytı (Ctrl+C, ETX).
 *
 * TEK sabit: komut kutusunun kaçış kapısı, "Durdur" düğmesi ve kutunun
 * "SIGINT gittiyse satırı boşalt" denetimi hepsi buradan okuyor. Üç yerde
 * `"\x03"` yazılsaydı biri değiştiğinde ötekiler sessizce çalışmayan bir bayt
 * göndermeye ya da yanlış baytı beklemeye başlardı.
 */
export const SIGINT = "\x03";

/**
 * Uygulama kipinde bile doğrudan kabuğa geçmesi gereken tuşlar.
 *
 * Alanlar `KeyboardEvent` ile AYNI ADDA: çağıran olayı olduğu gibi verebilsin,
 * araya el yapımı bir nesne girmesin. Dört değiştiricinin dördü de burada ve
 * bu bilinçli — eksik olan her biri bir kez hata oldu:
 *
 *  * `shiftKey` yoktu → Ctrl+Shift+C (Windows'ta KOPYALAMA kısayolu, bkz.
 *    `model.rs`) kutuda SIGINT'e dönüşüyor, yazılan satırı siliyordu.
 *  * `altKey` yoktu → Ctrl+Alt+C aynı yoldan geçiyordu. Windows'ta AltGr
 *    tarayıcıya `ctrlKey` + `altKey` olarak geliyor; Türkçe Q'da AltGr sürekli
 *    kullanılan bir tuş ve eşlenmemiş bir AltGr+C `key === "c"` olarak
 *    düşüyordu — pano boş, komut yok. Ctrl+Alt+D ise EOF gönderip kabuğu
 *    kapatabiliyordu.
 *  * `metaKey`: Ctrl+Win+C'nin kabuk için bir anlamı yok.
 *
 * Kabuğun denetim karakterleri YALNIZ Ctrl ile: Ctrl+C, Ctrl+D, Ctrl+L.
 * Başka bir değiştiricinin eşlik ettiği her basış arayüzün (ya da işletim
 * sisteminin) kısayol alanı, kabuğun değil.
 */
export interface PassThroughKey {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * Uygulama kipinde yakalanan tuşun kabuğa gönderilecek karşılığı.
 *
 * `null` dönerse tuş kutuda kalıyor (normal yazma).
 *
 * Ctrl+C'nin burada olması şart: kutu boşken bile kabuğa SIGINT gitmeli, yoksa
 * çalışan bir şeyi durdurmanın yolu kalmaz. Ctrl+D (dosya sonu) ve Ctrl+L
 * (ekranı temizle) aynı sebeple: ikisi de kabuğun işi, kutunun değil.
 */
export function passThroughSequence(event: PassThroughKey): string | null {
  if (!event.ctrlKey) return null;
  // Yalnız Ctrl (gerekçesi `PassThroughKey` üzerinde).
  if (event.shiftKey || event.altKey || event.metaKey) return null;
  switch (event.key.toLowerCase()) {
    case "c":
      return SIGINT;
    case "d":
      return "\x04";
    case "l":
      return "\x0c";
    default:
      return null;
  }
}

/**
 * `stdin` kipinde bir tuşun karşılığı.
 *
 *  - `send`: bayt HEMEN programa gidiyor, kutuya dokunulmuyor.
 *  - `submit`: kutudaki satır Enter'la birlikte programa, kutu boşalıyor.
 *  - `flush`: kutudaki satır ve ardından bayt programa, kutu boşalıyor.
 *  - `clear`: kutu boşalıyor, programa hiçbir şey gitmiyor.
 */
export type StdinAction =
  | { kind: "send"; data: string }
  | { kind: "submit" }
  | { kind: "flush"; data: string }
  | { kind: "clear" };

export interface StdinContext {
  /** Kutu boş mu. Boşken kutunun kullanmadığı tuşlar doğrudan programa gidiyor. */
  empty: boolean;
  /**
   * Program "uygulama imleç tuşları" istemiş mi (DECCKM, `ESC[?1h`).
   *
   * Oklar o kipte `ESC O A` olarak gidiyor, normalde `ESC [ A`. xterm bunu
   * kendisi seçiyordu; tuş artık xterm'den geçmediği için ayrımı burada
   * yapmak gerekiyor, yoksa kipi açan programda oklar tanınmaz.
   */
  appCursor: boolean;
}

const CSI = "\x1b[";

/** Okların ve Home/End'in son harfi (`ESC [ A` … `ESC [ F`). */
const CURSOR_FINAL: Record<string, string> = {
  ArrowUp: "A",
  ArrowDown: "B",
  ArrowRight: "C",
  ArrowLeft: "D",
  Home: "H",
  End: "F",
};

/** `ESC [ n ~` biçimindeki tuşlar. */
const TILDE_CODE: Record<string, number> = { Insert: 2, Delete: 3, PageUp: 5, PageDown: 6 };

/**
 * Boş kutuda basılan tuşun terminal dizisi — xterm'in göndereceğinin aynısı.
 *
 * Değiştirici kodlaması xterm'inki: `1 + Shift + 2·Alt + 4·Ctrl`, yani
 * Ctrl+→ `ESC [1;5C`. Programlar (readline, PSReadLine, Node'un `readline`ı)
 * sözcük atlamayı bu kodlamadan tanıyor.
 *
 * `null`: tuşun programa gidecek bir karşılığı yok; kutunun kendi işi (yazma,
 * yapıştırma) ya da arayüzün kısayolu.
 */
function directSequence(event: PassThroughKey, appCursor: boolean): string | null {
  // Cmd/Win işletim sisteminin ve arayüzün alanı; programın değil.
  if (event.metaKey) return null;
  const mod = 1 + (event.shiftKey ? 1 : 0) + (event.altKey ? 2 : 0) + (event.ctrlKey ? 4 : 0);

  const final = CURSOR_FINAL[event.key];
  if (final) {
    if (mod > 1) return `${CSI}1;${mod}${final}`;
    return appCursor ? `\x1bO${final}` : `${CSI}${final}`;
  }

  const tilde = TILDE_CODE[event.key];
  if (tilde) {
    // Shift+PageUp/PageDown terminalde KAYDIRMANIN tuşu, programa gitmiyor.
    if (event.shiftKey && (event.key === "PageUp" || event.key === "PageDown")) return null;
    return mod > 1 ? `${CSI}${tilde};${mod}~` : `${CSI}${tilde}~`;
  }

  switch (event.key) {
    case "Enter":
      return event.altKey ? "\x1b\r" : "\r";
    case "Tab":
      // Ctrl+Tab sekme değiştiriyor, Alt+Tab işletim sisteminin.
      if (event.ctrlKey || event.altKey) return null;
      return event.shiftKey ? `${CSI}Z` : "\t";
    case "Escape":
      return "\x1b";
    case "Backspace":
      if (event.ctrlKey) return "\x08";
      return event.altKey ? "\x1b\x7f" : "\x7f";
    case " ":
      // Boşluk işaret kutulu listelerde seçimi değiştiren tuş; boş bir yanıtın
      // başındaki boşluğun ise bir anlamı yok.
      if (event.altKey) return null;
      return event.ctrlKey ? "\x00" : " ";
    default:
      break;
  }

  /*
   * Yalnız Ctrl + harf: denetim karakteri (Ctrl+D → EOT, Ctrl+Z → SUB …).
   *
   * İki harf dışarıda. V yapıştırma: pano kutuya gelmeli, programa
   * `\x16` değil. C'nin kararı `resolveCtrlC`nin — kopyalama da demek ve o
   * karar tek yerde.
   *
   * Shift ve Alt'ın eşlik ettiği basışlar geçmiyor (gerekçesi
   * `PassThroughKey` üzerinde; Windows'ta AltGr ctrl+alt olarak geliyor).
   */
  if (event.ctrlKey && !event.shiftKey && !event.altKey && /^[a-z]$/i.test(event.key)) {
    const letter = event.key.toLowerCase();
    if (letter === "v" || letter === "c") return null;
    return String.fromCharCode(letter.charCodeAt(0) - 96);
  }
  return null;
}

/**
 * Çalışan komuta yazarken tuşun ne yapacağı.
 *
 * ## Kural tek cümle
 *
 * Kutu BOŞKEN kutunun kullanmadığı her tuş doğrudan programa gidiyor; yazmaya
 * başlayınca satır kutuda toplanıyor ve Enter'la gönderiliyor.
 *
 * Boş kutu seçim listelerini, "devam etmek için bir tuşa basın"ı ve
 * programların Ctrl kısayollarını çalıştırıyor. Dolu kutu ise sıradan bir
 * satır düzenleyici: oklar imleci yürütüyor, Backspace kutudan siliyor.
 *
 * ## Dolu kutuda üç özel tuş
 *
 *  - Tab: satır ve ardından Tab (`flush`). Tamamlamayı yapacak olan program
 *    (REPL, ssh ardındaki kabuk); satırı görmeden tamamlayamaz. Program
 *    satırı kendi ekranında gösterdiği için kutu boşalıyor ve yazmaya kalınan
 *    yerden devam ediliyor — program aynı baytları, aynı sırada alıyor.
 *  - Ctrl+D: satır ve ardından EOT. Terminal sürücüsünün de yaptığı bu:
 *    bekleyen satırı yeni satır eklemeden teslim ediyor.
 *  - Esc: satırı bırakıyor (`clear`), PSReadLine'daki gibi. Programa gitmiyor;
 *    kutu boşken ise gidiyor.
 *
 * Ctrl+L satıra dokunmadan ekranı temizletiyor, uygulama kipindeki gibi.
 *
 * Ctrl+C burada YOK: kopyalamak da demek ve karar `resolveCtrlC`de, iki kipte
 * de aynı yerden.
 */
export function stdinKeyAction(event: PassThroughKey, ctx: StdinContext): StdinAction | null {
  const onlyCtrl = event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
  const letter = event.key.toLowerCase();
  if (onlyCtrl && letter === "c") return null;
  if (onlyCtrl && letter === "l") return { kind: "send", data: "\x0c" };

  if (ctx.empty) {
    const data = directSequence(event, ctx.appCursor);
    return data === null ? null : { kind: "send", data };
  }

  if (event.metaKey) return null;
  // Shift+Enter kutuda yeni satır açıyor, uygulama kipindeki gibi.
  if (event.key === "Enter" && !event.shiftKey) return { kind: "submit" };
  if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.altKey) {
    return { kind: "flush", data: "\t" };
  }
  if (onlyCtrl && letter === "d") return { kind: "flush", data: "\x04" };
  if (event.key === "Escape") return { kind: "clear" };
  return null;
}

/**
 * Parolada geçen sözcükler.
 *
 * İngilizce sözcüklerin iki yanı SINIRLI: "pin" "Pinging"in içinde de geçiyor
 * ve `ping` çıktısının satırı iki noktayla bitiyor. Türkçe ve Almanca
 * sözcüklere ek serbest ("parolanız", "şifresi", "Kennwortes").
 */
const SECRET_PROMPT =
  /(?<![\p{L}\p{N}])(?:(?:password|passphrase|passcode|pin|token|secret|contraseña|senha|mot de passe)(?![\p{L}\p{N}])|(?:parola|şifre|sifre|passwort|kennwort)\p{L}*)/iu;

/**
 * İmlecin durduğu satır bir parola sorusu mu?
 *
 * ## Neden gerekiyor
 *
 * Program parola sorarken terminal yazılanı YANSITMIYOR (yankı kapalı).
 * Kutu ise yazılanı gösteriyor; bu sezgi olmasa `ssh`, `git`, `sudo` sorduğunda
 * parola kutuda açık metin olarak dururdu — ızgaraya yazıldığı eski hâlden
 * geri bir adım.
 *
 * Asıl işaret (yankının kapalı olduğu) terminale ulaşmıyor: Windows'ta
 * ConPTY konsolun kipini dışarı vermiyor. Elde kalan, sorunun kendisi.
 * Satır iki noktayla bitiyor ve parola sözcüklerinden birini taşıyorsa gizli
 * sayılıyor: "user@host's password:", "Enter passphrase for key …:",
 * "Password for 'https://…':", "Parola:".
 *
 * Yanlış pozitifin bedeli küçük (yazılan nokta olarak görünüyor, gönderilen
 * aynı); yanlış negatifin bedeli ekranda açık parola. Sezgi bu yüzden geniş
 * tutuldu: "token" ve "secret" de gizli sayılıyor.
 */
export function looksLikeSecretPrompt(line: string): boolean {
  const text = line.trimEnd();
  if (!text.endsWith(":") && !text.endsWith("：")) return false;
  return SECRET_PROMPT.test(text);
}

/**
 * Ctrl+C'nin bu an ne yapması gerektiği.
 *
 * ## Neden tek işlev
 *
 * BİLDİRİLEN HATA: "Komut yazın kısmında `cd Desktop\Work\Github\Survey`
 * yazıyorum, metni seçip kopyalamak için Ctrl+C basıyorum; metin kayboluyor
 * ve kopyalayamamış oluyorum."
 *
 * Karar o güne kadar oturumdaydı (`wantsCtrlCCopy`) ve yalnızca terminal
 * IZGARASINDAKİ seçimi biliyordu; kutu bir `textarea`, seçimi tarayıcının
 * modelinde. Kutudaki seçim görünmez olduğu için tuş SIGINT'e dönüşüyor ve
 * satır siliniyordu. İlk düzeltme kutuya kendi Ctrl+C kuralını yazdı — ve
 * inceleme aynı gün üç ayrı kopya saydı: platform kuralı iki yerde, ayar
 * yalnızca birinde, tuş yüklemi üç biçimde. Kopyalar ayrıştığında iki sessiz
 * hatadan biri oluyor: ya seçim kopyalanmıyor, ya da tuş yutulup SIGINT
 * kabuğa hiç ulaşmıyor.
 *
 * Bu yüzden kural burada, saf bir işlevde: girdileri kim topluyorsa toplasın
 * (oturum ızgarayı ve ayarı biliyor, kutu kendi seçimini), karar tek yerden
 * çıkıyor ve testi klavye kurmadan yazılıyor.
 *
 * ## Sıra
 *
 *  1. mac: Ctrl+C tümüyle kabuğun tuşu; kopyalama orada Cmd+C. Seçim olsa da
 *     SIGINT.
 *  2. Ayar kapalı ("Ctrl+C seçim varken kopyalasın" işareti kalkmış):
 *     kullanıcı Ctrl+C'nin HER ZAMAN kesme olmasını istemiş. Ayar ızgaraya
 *     göre yazıldı ama metni bir kutuyu dışarıda bırakmıyor — iki yüzeyde
 *     farklı davranmak ayarı yarım yalan yapardı.
 *  3. Kutudaki seçim ızgaradakinden ÖNCE: odak kutudayken yazılan yer orası.
 *  4. Ne kutuda ne ızgarada seçim yoksa kabuğa.
 */
export type CtrlCAction = "copy-box" | "copy-grid" | "sigint";

export interface CtrlCSignals {
  /** macOS mu. */
  mac: boolean;
  /** `behavior.ctrlCCopiesSelection` ayarı. */
  copiesSelection: boolean;
  /** Komut kutusunda (textarea) seçili metin var mı. */
  boxSelection: boolean;
  /** Terminal ızgarasında (xterm) seçim var mı. */
  gridSelection: boolean;
}

export function resolveCtrlC(signals: CtrlCSignals): CtrlCAction {
  if (signals.mac) return "sigint";
  if (!signals.copiesSelection) return "sigint";
  if (signals.boxSelection) return "copy-box";
  if (signals.gridSelection) return "copy-grid";
  return "sigint";
}
