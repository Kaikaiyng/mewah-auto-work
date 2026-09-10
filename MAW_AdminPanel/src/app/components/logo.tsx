import { HTMLAttributes } from "react";

interface LogoProps extends HTMLAttributes<SVGElement> {
  className?: string;
}

export function Logo({ className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 450 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Circular arc of the gear (white/currentColor) */}
      <path
        d="M 60 12 A 48 48 0 1 0 60 108"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />

      {/* Top and Bottom Tapering Wedges (white/currentColor) */}
      <polygon points="60,10 430,12 60,14" fill="currentColor" />
      <polygon points="60,106 430,108 60,110" fill="currentColor" />

      {/* Gear teeth (5 teeth on the left side) */}
      {/* Center is (60, 60). Base tooth is rect at top (rotated 0 deg) */}
      <g fill="currentColor">
        <rect x="52" y="2" width="16" height="8" rx="2" />
        <rect x="52" y="2" width="16" height="8" rx="2" transform="rotate(-45 60 60)" />
        <rect x="52" y="2" width="16" height="8" rx="2" transform="rotate(-90 60 60)" />
        <rect x="52" y="2" width="16" height="8" rx="2" transform="rotate(-135 60 60)" />
        <rect x="52" y="2" width="16" height="8" rx="2" transform="rotate(-180 60 60)" />
      </g>

      {/* Interlocking diamonds (bright cyan) */}
      <g stroke="#38bdf8" strokeWidth="4.5" fill="none" strokeLinejoin="round" strokeLinecap="round">
        {/* Left Diamond */}
        <path d="M 29 60 L 45 44 L 61 60 L 45 76 Z" />
        {/* Right Diamond */}
        <path d="M 59 60 L 75 44 L 91 60 L 75 76 Z" />
      </g>

      {/* Text (bright cyan) */}
      <text
        x="130"
        y="62"
        fill="#38bdf8"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="52"
        letterSpacing="1"
      >
        MEWAH
      </text>
      <text
        x="132"
        y="92"
        fill="#38bdf8"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight="700"
        fontSize="20"
        letterSpacing="8"
      >
        AUTOWORKS
      </text>
    </svg>
  );
}
