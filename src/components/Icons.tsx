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

/** Başlık çubuğundaki dosya ağacı düğmesi. */
export function TreeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2.5 3.5 H7" />
      <path d="M2.5 3.5 V12.5 H6" />
      <path d="M2.5 8 H6" />
      <path d="M8.5 3.5 H13.5" />
      <path d="M8.5 8 H13.5" />
      <path d="M8 12.5 H13.5" />
    </Svg>
  );
}

/** Başlık çubuğundaki arama alanının büyüteci. */
export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.3" />
      <path d="M10.2 10.2 L13.5 13.5" />
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

/** Komut satırındaki dizin rozetinin klasörü. */
export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 4.5 C2 3.7 2.7 3 3.5 3 H6 L7.5 4.8 H12.5 C13.3 4.8 14 5.5 14 6.3 V11.5 C14 12.3 13.3 13 12.5 13 H3.5 C2.7 13 2 12.3 2 11.5 Z" />
    </Svg>
  );
}

/**
 * Tuş başlığındaki yön oku.
 *
 * Yazı tipi karakteri (`↑`) DEĞİL, aynı sebeple: rozetin içinde okun boyu ve
 * taban hizası yazı tipine göre oynuyor, kimi tipte rozetten taşıyor.
 */
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
