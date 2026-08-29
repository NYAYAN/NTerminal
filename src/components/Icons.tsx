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
