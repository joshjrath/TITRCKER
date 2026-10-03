import type { SVGProps } from "react";

const CENTER = 12;
const RADIUS = 9;
const ARC_WIDTH = 3;

function polar(angleDeg: number): string {
  const a = (angleDeg * Math.PI) / 180;
  return `${(CENTER + RADIUS * Math.cos(a)).toFixed(3)} ${(CENTER + RADIUS * Math.sin(a)).toFixed(3)}`;
}

/*
 * One tenth of the circle: an exact 36° annular segment from 12 o'clock, clockwise. Butt caps keep
 * it a precise fraction of the ring — with round caps the short segment collapsed into a capsule
 * at 20-28px. (The orbit, timeline and chart lines keep round caps; this is the mark, not a line.)
 */
const ARC_PATH = `M ${polar(-90)} A ${RADIUS} ${RADIUS} 0 0 1 ${polar(-54)}`;

export interface LogoMarkProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Rendered size in px (square). Works from 16 to 64. */
  size?: number;
  /** When true the mark is decorative (aria-hidden), e.g. next to a visible "Tenth" wordmark. */
  decorative?: boolean;
}

/** The Tenth mark: a thin ring with one bold 36° arc segment in lavender. */
export function LogoMark({ size = 28, decorative = false, className, ...rest }: LogoMarkProps) {
  const a11y = decorative
    ? ({ "aria-hidden": true, focusable: false } as const)
    : ({ role: "img", "aria-label": "Tenth" } as const);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className}
      {...a11y}
      {...rest}
    >
      <circle cx={CENTER} cy={CENTER} r={RADIUS} stroke="var(--accent)" strokeOpacity={0.45} strokeWidth={1.25} />
      <path d={ARC_PATH} stroke="var(--accent)" strokeWidth={ARC_WIDTH} strokeLinecap="butt" />
    </svg>
  );
}

export interface LogoProps {
  size?: number;
  /** Show the "Tenth" wordmark beside the mark. */
  withWordmark?: boolean;
  className?: string;
}

/** Mark with optional wordmark. The accessible name is always "Tenth". */
export function Logo({ size = 28, withWordmark = false, className }: LogoProps) {
  if (!withWordmark) return <LogoMark size={size} className={className} />;
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark size={size} decorative />
      <span className="text-[1.0625rem] font-medium tracking-[-0.02em] text-text">Tenth</span>
    </span>
  );
}
