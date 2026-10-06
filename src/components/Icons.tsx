/**
 * Küçük satır içi SVG simgeler.
 *
 * Neden yazı tipi karakteri değil: `⌄` / `⌃` (U+2304 / U+2303) ve `▾` / `▸`
 * gibi karakterler yazı tipine göre farklı boyutta ve farklı taban hizasında
 * çiziliyor — kimi yazı tipinde minik, kimisinde satırdan taşan, kimisinde
 * eksik glif çıkıyor. SVG her yerde aynı görünüyor, `currentColor` ile de
 * temaya uyuyor.
 */

interface IconProps {
  /** Kenar uzunluğu (px). */
  size?: number;
  className?: string;
}

function Svg({
  size = 14,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Grup başlığındaki açma/kapama oku. */
export function ChevronIcon({ open, ...props }: IconProps & { open: boolean }) {
  return (
    <Svg {...props}>
      {open ? <path d="M4 6.5 L8 10.5 L12 6.5" /> : <path d="M6.5 4 L10.5 8 L6.5 12" />}
    </Svg>
  );
}

/**
 * "Grupları daralt": iki ok birbirine doğru bakıyor (Material `unfold_less`
 * karşılığı) — içerik kapanıyor.
 */
export function CollapseAllIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 3.5 L8 7 L12 3.5" />
      <path d="M4 12.5 L8 9 L12 12.5" />
    </Svg>
  );
}

/**
 * "Grupları aç": iki ok birbirinden uzaklaşıyor (`unfold_more`) — içerik
 * açılıyor.
 */
export function ExpandAllIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7 L8 3.5 L12 7" />
      <path d="M4 9 L8 12.5 L12 9" />
    </Svg>
  );
}

/** Dolu yıldız — favori işareti. */
export function StarIcon({ filled = true, size = 13, className }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.4}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 1.7 L10 6 L14.6 6.5 L11.2 9.7 L12.1 14.3 L8 12 L3.9 14.3 L4.8 9.7 L1.4 6.5 L6 6 Z" />
    </svg>
  );
}

/**
 * Sekme görünümü: üstte tek sekmesi olan bir pano — aynı anda tek terminal.
 */
export function TabsViewIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 5.5 H13.5 V13 H2.5 Z" />
      <path d="M2.5 5.5 V3.5 H7.5 V5.5" />
    </Svg>
  );
}

/**
 * Bölme görünümü: bölünmüş pano — grubun sekmeleri aynı ekranda.
 */
export function PanesViewIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 3.5 H13.5 V12.5 H2.5 Z" />
      <path d="M8 3.5 V12.5" />
      <path d="M8 8 H13.5" />
    </Svg>
  );
}

/** Artı — yeni sekme / yeni grup. */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3.5 L8 12.5" />
      <path d="M3.5 8 L12.5 8" />
    </Svg>
  );
}

/**
 * Çarpı — satırı listeden silen düğme (öneri panelinde geçmişten silme).
 *
 * Öneri satırı kullanıcının seçtiği tek aralıklı yazı tipiyle çiziliyor; `×`
 * karakteri orada da dosya başlığındaki sorunu taşırdı.
 */
export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 4.5 L11.5 11.5" />
      <path d="M11.5 4.5 L4.5 11.5" />
    </Svg>
  );
}

/**
 * Grup kenar çubuğunu daraltma/açma düğmesi.
 *
 * Pencere ve içindeki sol sütun: hangi panelin açılıp kapandığı simgenin
 * kendisinden okunuyor. Dolu sütun "panel açık" demiyor — durum düğmenin `on`
 * sınıfından ve ipucundan geliyor; simge her iki durumda da aynı kalıyor ki
 * düğme yer değiştirmiş gibi görünmesin.
 */
export function SidebarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 3.5 H13.5 V12.5 H2.5 Z" />
      <path d="M6.5 3.5 V12.5" />
    </Svg>
  );
}

/* Başlık çubuğundaki dosya düğmesinin simgesi `FolderIcon`; buradaki ağaç
 * simgesi (dallanan çizgiler) kaldırıldı — bir veri yapısını anlatıyordu,
 * kullanıcının aradığı şeyi ("dosyalar") değil. */

/** Başlık çubuğundaki arama alanının büyüteci. */
export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.3" />
      <path d="M10.2 10.2 L13.5 13.5" />
    </Svg>
  );
}

/**
 * Ayar açıklamalarını açan "i" düğmesinin simgesi.
 *
 * Yazı tipi karakteri (ⓘ, U+24D8) DEĞİL: dosyanın başındaki gerekçe burada da
 * geçerli — o karakter kimi yazı tipinde satırdan taşıyor, kimisinde eksik.
 * Ayrıca tek harflik metin arayüz metni taramasına (hardcodedText.test) takılır
 * ve çeviri istemez; simge olması o yanlış pozitifi de ortadan kaldırıyor.
 */
export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 7.3 V11" />
      <path d="M8 4.9 h0.01" />
    </Svg>
  );
}

/**
 * "Varsayılana döndür" düğmesinin geri alma oku.
 *
 * Çöp kutusu ya da çarpı DEĞİL: ikisi de "sil" diyor, buradaki eylem ise
 * silmek değil GERİ ALMAK — ayarın varsayılan değeri geri geliyor.
 */
export function UndoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 2.6 L3 5.6 L6 8.6" />
      <path d="M3 5.6 H9 A3 3 0 1 1 9 11.6 H6.6" />
    </Svg>
  );
}

/** Git dal rozetinin çatal işareti. */
export function BranchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="4.5" cy="3.5" r="1.8" />
      <circle cx="4.5" cy="12.5" r="1.8" />
      <circle cx="11.5" cy="4.5" r="1.8" />
      <path d="M4.5 5.3 V10.7" />
      <path d="M11.5 6.3 C11.5 9 9 9.2 6.4 10" />
    </Svg>
  );
}

/** Komut satırındaki Node rozetinin altıgeni (Node.js logosunun biçimi). */
export function NodeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 1.6 L13.6 4.8 V11.2 L8 14.4 L2.4 11.2 V4.8 Z" />
    </Svg>
  );
}

/** Komut satırındaki dizin rozetinin klasörü. */
export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 4.5 C2 3.7 2.7 3 3.5 3 H6 L7.5 4.8 H12.5 C13.3 4.8 14 5.5 14 6.3 V11.5 C14 12.3 13.3 13 12.5 13 H3.5 C2.7 13 2 12.3 2 11.5 Z" />
    </Svg>
  );
}

/** Düzenle (kalem) — dosya görüntüleyicisi; fark penceresindekiyle aynı çizim. */
export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.5 2.8 L13.2 5.5 L5.6 13.1 L2.6 13.4 L2.9 10.4 Z M9.2 4.1 L11.9 6.8" />
    </Svg>
  );
}

/** İleri al: `UndoIcon`un aynası. */
export function RedoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10 2.6 L13 5.6 L10 8.6" />
      <path d="M13 5.6 H7 A3 3 0 1 0 7 11.6 H9.4" />
    </Svg>
  );
}

/** Kaydet: disket. */
export function SaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 2.5 H11 L13.5 5 V13.5 H3 Z M5.5 2.5 V5.5 H10 V2.5 M5.5 13.5 V9.5 H10.5 V13.5" />
    </Svg>
  );
}

/**
 * Tuş başlığındaki yön oku.
 *
 * Yazı tipi karakteri (`↑`) DEĞİL, aynı sebeple: rozetin içinde okun boyu ve
 * taban hizası yazı tipine göre oynuyor, kimi tipte rozetten taşıyor.
 */
/**
 * Süren iş: soluk bir halka ve üstünde dönen bir yay (`.spinner`, global.css).
 *
 * Düğmelerin içinde, simgenin YERİNDE kullanılıyor: commit atılırken ve push
 * sürerken. Yazıyı "Gönderiliyor…" yapmak düğmenin genişliğini her basışta
 * değiştiriyordu; simgenin yerine geçen çark genişliği sabit tutuyor (İSTEK:
 * "spinner olsa daha iyi olmaz mı, profesyonel görünür").
 */
export function SpinnerIcon({ className, ...props }: IconProps) {
  return (
    <Svg {...props} className={className ? `spinner ${className}` : "spinner"}>
      <circle cx="8" cy="8" r="5.5" opacity="0.25" />
      <path d="M8 2.5 A5.5 5.5 0 0 1 13.5 8" />
    </Svg>
  );
}

export function ArrowIcon({ dir, ...props }: IconProps & { dir: "up" | "down" | "right" }) {
  const paths = {
    up: "M8 12.5 V4 M4.5 7.5 L8 4 L11.5 7.5",
    down: "M8 3.5 V12 M4.5 8.5 L8 12 L11.5 8.5",
    right: "M3.5 8 H12 M8.5 4.5 L12 8 L8.5 11.5",
  };
  return (
    <Svg {...props}>
      <path d={paths[dir]} />
    </Svg>
  );
}

/**
 * Fark penceresi — ortadan bölünmüş bir pencere: solda eski, sağda yeni.
 *
 * Değişiklikler satırındaki "Farkı yeni pencerede göster" düğmesinde. Açılan
 * pencerenin kendisini çiziyor: kullanıcı simgeye basınca neyin açılacağını
 * simgeden okuyabilmeli. (Fark penceresinin araç çubuğundaki "Side-by-side
 * viewer" düğmesi de aynı resmi kullanıyor; o, IntelliJ'in simgesinin karşılığı.)
 */
export function DiffWindowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="3" width="12" height="10" rx="1.6" />
      <path d="M8 3 V13" />
    </Svg>
  );
}

/**
 * Aç — oklar birbirinden UZAKLAŞIYOR.
 *
 * Fark görünümündeki bağlam açıcısında, kalan gizli satırların tek basışta
 * açılacağı durumda kullanılıyor. Tek yönlü bir ok orada yanlış söz verirdi:
 * açılan satırların yarısı yukarı, yarısı aşağı değil — hepsi açılıyor.
 */
export function UnfoldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 6 L8 2.5 L11.5 6 M4.5 10 L8 13.5 L11.5 10" />
    </Svg>
  );
}

/**
 * Git durum simgeleri.
 *
 * Metin etiketinin ("DEĞİŞTİ", "EKLENDİ") yerini aldılar. Etiket sabit 88px'lik
 * bir sütun yiyordu ve o sütun dosya YOLUNDAN çalınmıştı — panel dar olduğunda
 * asıl aranan bilgi, yolun kendisi, kırpılıyordu. Durum zaten renkle
 * kodlanmış; simge o rengi taşıyıp ipucunda tam metni veriyor.
 *
 * Dördü de aynı çerçevede (16x16) ve aynı ağırlıkta: liste dikey tarandığı
 * için simgelerin optik boyutu birbirinden ayrılmamalı.
 */

/** Değişti — kalem. */
export function GitModifiedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11.2 2.8 L13.2 4.8 L5.5 12.5 L2.8 13.2 L3.5 10.5 Z" />
    </Svg>
  );
}

/** Eklendi — artı. */
export function GitAddedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 5.4 V10.6" />
      <path d="M5.4 8 H10.6" />
    </Svg>
  );
}

/** Silindi — eksi. */
export function GitDeletedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M5.4 8 H10.6" />
    </Svg>
  );
}

/** Yeniden adlandırıldı — ok. */
export function GitRenamedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M5.2 8 H10.4" />
      <path d="M8.4 5.9 L10.6 8 L8.4 10.1" />
    </Svg>
  );
}

/**
 * Takip edilmiyor — BOŞ, kesik çizgili çember.
 *
 * İçinde ARTI YOK ve bu bilinçli: artı "eklendi" demek (dosya indekste, yani
 * commit'e girecek). İlk hâlinde takipsiz simgesi de artı taşıyordu ve
 * kullanıcı ikisini karıştırdı — "artı işaretli olan neden takip edilmiyor
 * diyor?" Kesik çizgi tek başına doğru şeyi söylüyor: çerçeve var ama içi
 * boş, yani dosya git'in gözünde henüz yok.
 */
export function GitUntrackedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.6" strokeDasharray="2.6 2.2" />
    </Svg>
  );
}

/** Panoya kopyala — iki üst üste sayfa. */
export function CopyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.5 5.5 H13 V13 H5.5 Z" />
      <path d="M10.5 5.5 V3 H3 V10.5 H5.5" />
    </Svg>
  );
}

/** Geri al — sola dönen ok. */
export function RevertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 7.5 H10 C12 7.5 13 8.7 13 10.2 C13 11.7 12 13 10 13 H6" />
      <path d="M6 4 L2.8 7.5 L6 11" />
    </Svg>
  );
}

/**
 * Stash'e at — tepsiye inen ok.
 *
 * Ok AŞAĞI: değişiklikler çalışma ağacından kenara alınıyor. Ters yönlüsü
 * (`UnstashIcon`) geri getirmek için; ikisi aynı tepsiyi paylaşıyor, yani aynı
 * şeyin iki yönü gibi okunuyor.
 */
export function StashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 2.5 V9" />
      <path d="M5.2 6.6 L8 9.4 L10.8 6.6" />
      <path d="M2.8 10.5 V12.5 H13.2 V10.5" />
    </Svg>
  );
}

/** Stash'i uygula — tepsiden çıkan ok. */
export function UnstashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 9.2 V2.8" />
      <path d="M5.2 5.4 L8 2.6 L10.8 5.4" />
      <path d="M2.8 10.5 V12.5 H13.2 V10.5" />
    </Svg>
  );
}

/** Sil — çöp kutusu. */
export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4.5 H13" />
      <path d="M6.2 4.5 V3 H9.8 V4.5" />
      <path d="M4.2 4.5 L4.8 13 H11.2 L11.8 4.5" />
      <path d="M6.8 7 V10.5 M9.2 7 V10.5" />
    </Svg>
  );
}

/**
 * Ayarlar — sekiz dişli çark.
 *
 * Dişler 8x45°, çokgen olarak çiziliyor (yay yok): 13px'te yay hesabıyla çizilmiş
 * bir çark bulanıklaşıyor, köşeli çokgen keskin kalıyor. Ortadaki daire göbek.
 */
export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.7 3.3 L6.9 1.4 L9.1 1.4 L9.3 3.3 L10.5 3.8 L11.9 2.5 L13.5 4.1 L12.2 5.6 L12.7 6.7 L14.6 6.9 L14.6 9.1 L12.7 9.3 L12.2 10.4 L13.5 11.9 L11.9 13.5 L10.5 12.2 L9.3 12.7 L9.1 14.6 L6.9 14.6 L6.7 12.7 L5.6 12.2 L4.1 13.5 L2.5 11.9 L3.8 10.4 L3.3 9.3 L1.4 9.1 L1.4 6.9 L3.3 6.7 L3.8 5.5 L2.5 4.1 L4.1 2.5 L5.5 3.8 Z" />
      <circle cx="8" cy="8" r="2.1" />
    </Svg>
  );
}

/**
 * Claude Code'un maskotu: `claude` açılınca terminalin başında çıkan resim.
 *
 * Claude Code onu blok karakterlerle çiziyor (`▐▛███▛█`): her karakter 2×2
 * piksel, terminal hücresi eninin iki katı boyunda olduğu için piksel 1×2.
 * viewBox aynı ızgara — 17 sütun, her biri 2 birim boyunda beş sıra. Bacaklar
 * 2.1.289'daki gibi gövdenin kenarlarının ve gözlerin altında.
 *
 * Renkler Claude Code temasının `clawd_body` ve `clawd_background` değerleri;
 * `currentColor` bilerek yok, resim her temada aynı tanınmalı. `size` burada
 * genişlik. 17px'te bir sütun bir piksele düşüyor, `crispEdges` gözleri ve
 * bacakları keskin tutuyor. Sekme rozetlerinde boyu CSS veriyor: resim rozet
 * kutusunu dolduruyor (global.css, `.tab-row-badge.claude`).
 */
export function ClaudeIcon({ size = 17, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={(size * 10) / 17}
      viewBox="0 0 17 10"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#d77757"
        d="M2 0H15V4H17V6H15V8H2V6H0V4H2Z M2 8H3V10H2Z M4 8H5V10H4Z M12 8H13V10H12Z M14 8H15V10H14Z"
      />
      <path fill="#000" d="M4 2H5V4H4Z M12 2H13V4H12Z" />
    </svg>
  );
}
