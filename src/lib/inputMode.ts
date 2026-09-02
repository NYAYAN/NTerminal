/**
 * Tuş vuruşları nereye gidiyor: uygulamanın girdi kutusuna mı, doğrudan
 * kabuğa mı?
 *
 * ## Neden iki kip var
 *
 * İstenen davranış Warp'ınki: komut satırı terminalin ızgarasının dışında,
 * pencerenin dibinde sabit duran bir kutu. Yazdıklarınız kabuğa ancak Enter'a
 * bastığınızda gidiyor. Böylece kaydırma satırı oynatmıyor, satır ekranın bir
 * parçası olmadığı için de kaybolmuyor.
 *
 * Ama bir terminalde girdiyi HER ZAMAN uygulamanın toplaması mümkün değil:
 * `vim`, `ssh` parola istemi, `python` REPL, `git rebase -i` — bunlar tuşları
 * BİR BİR, o an istiyor. Enter'a kadar bekleyen bir kutu bu programları
 * kullanılamaz hâle getirir.
 *
 * Bu yüzden kip, kabuğun ne yaptığına bakarak seçiliyor. Karar burada, saf bir
 * işlevde: gerçek terminalde denemesi zor (doğru anda doğru program çalışıyor
 * olmalı), ama girdiği dört sinyal net.
 *
 * ## Sinyaller
 *
 * `atPrompt` kabuk entegrasyonundan geliyor (OSC 133): `B` "komut girişi
 * başlıyor", `C` "komut çalışmaya başladı". Yani kabuk sizi beklerken true,
 * bir komut çalışırken false.
 *
 * `altScreen` xterm'den: tam ekran programlar (vim, less, htop) ikincil ekran
 * tamponuna geçiyor. Entegrasyon sinyali gecikse bile bu yakalıyor.
 */
export type InputMode = "app" | "raw";

export interface InputSignals {
  /** Ayar açık mı (kullanıcı klasik terminale dönebilmeli). */
  enabled: boolean;
  /** Kabuk entegrasyonu bu sekmede çalışıyor mu. */
  integration: boolean;
  /** Kabuk istemde bekliyor mu (OSC 133;B geldi, 133;C gelmedi). */
  atPrompt: boolean;
  /** İkincil ekran tamponu etkin mi (vim, less, htop). */
  altScreen: boolean;
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
  if (!signals.atPrompt) return "raw";
  return "app";
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
