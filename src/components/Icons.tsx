import type { CSSProperties } from "react";

interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  color?: string;
}

const defaultColor = "#9c7a2e";

export function IconScales({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      {/* Ornate scales of justice */}
      <circle cx="12" cy="2.5" r="1.2" fill={color} />
      <path d="M12 3.5v2.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      {/* Crossbeam with decorative ends */}
      <path d="M3.5 7h17" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="3.5" cy="7" r="0.8" fill={color} fillOpacity="0.6" />
      <circle cx="20.5" cy="7" r="0.8" fill={color} fillOpacity="0.6" />
      {/* Central pillar */}
      <path d="M12 6v15" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      {/* Base */}
      <path d="M8 21h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 21l-1 1.5h7l-1-1.5" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill={color} fillOpacity="0.15" />
      {/* Left pan — chains + bowl */}
      <path d="M3.5 7.5L2 13M3.5 7.5L5 13" stroke={color} strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      <path d="M1 13a2.5 2 0 0 0 5 0z" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.15" strokeLinejoin="round" />
      <ellipse cx="3.5" cy="13" rx="2.5" ry="0.5" stroke={color} strokeWidth="0.8" fill="none" opacity="0.5" />
      {/* Right pan — chains + bowl */}
      <path d="M20.5 7.5L19 13M20.5 7.5L22 13" stroke={color} strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
      <path d="M18 13a2.5 2 0 0 0 5 0z" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.15" strokeLinejoin="round" />
      <ellipse cx="20.5" cy="13" rx="2.5" ry="0.5" stroke={color} strokeWidth="0.8" fill="none" opacity="0.5" />
      {/* Central diamond ornament */}
      <path d="M12 9l1 1.5-1 1.5-1-1.5z" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}

export function IconMoon({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      {/* Crescent moon with inner detail */}
      <path d="M20.5 12.5A8.5 8.5 0 1 1 11.5 3a6.5 6.5 0 0 0 9 9.5z" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill={color} fillOpacity="0.12" />
      {/* Inner crescent line for depth */}
      <path d="M18.5 12A6.5 6.5 0 0 1 12.5 5.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.4" fill="none" />
      {/* Stars scattered around */}
      <path d="M17 4l.4 1 .6.1-.5.4.2.7-.7-.4-.7.4.2-.7-.5-.4.6-.1z" fill={color} fillOpacity="0.8" />
      <circle cx="19" cy="9" r="0.5" fill={color} fillOpacity="0.6" />
      <circle cx="15.5" cy="15" r="0.4" fill={color} fillOpacity="0.5" />
      <path d="M6 17l.3.8.8.1-.6.5.2.8-.7-.4-.7.4.2-.8-.6-.5.8-.1z" fill={color} fillOpacity="0.4" />
      {/* Small moon craters */}
      <circle cx="14" cy="9" r="0.6" fill={color} fillOpacity="0.2" />
      <circle cx="16" cy="12" r="0.4" fill={color} fillOpacity="0.15" />
    </svg>
  );
}

export function IconSun({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      {/* Outer sun rays — alternating long/short */}
      <path d="M12 1.5v2.5M12 20v2.5M1.5 12h2.5M20 12h2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M4.2 19.8L6 18M18 6l1.8-1.8" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      {/* Inner rays — shorter, offset */}
      <path d="M12 5v1.5M12 17.5V19M5 12h1.5M17.5 12H19M6.8 6.8l1 1M16.2 16.2l1 1M6.8 17.2l1-1M16.2 7.8l1-1" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
      {/* Sun disc with inner ring */}
      <circle cx="12" cy="12" r="4" stroke={color} strokeWidth="1.3" fill={color} fillOpacity="0.18" />
      <circle cx="12" cy="12" r="2.8" stroke={color} strokeWidth="0.7" fill="none" opacity="0.4" />
      {/* Center dot */}
      <circle cx="12" cy="12" r="1" fill={color} fillOpacity="0.5" />
    </svg>
  );
}

export function IconStar({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      {/* 8-pointed star — outer */}
      <path d="M12 1.5l2.2 6.8 6.8 2.2-6.8 2.2L12 19.5l-2.2-6.8L3 10.5l6.8-2.2z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill={color} fillOpacity="0.2" />
      {/* 8-pointed star — inner, rotated */}
      <path d="M12 4.5l1.4 4.6 4.6 1.4-4.6 1.4L12 16.5l-1.4-4.6L6 10.5l4.6-1.4z" stroke={color} strokeWidth="0.7" strokeLinejoin="round" fill="none" opacity="0.5" />
      {/* Small diagonal rays */}
      <path d="M12 0.5v1M12 22.5v1M0.5 12h1M22.5 12h1" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.4" />
      {/* Center diamond */}
      <path d="M12 9l1.5 1.5L12 12l-1.5-1.5z" fill={color} fillOpacity="0.4" />
    </svg>
  );
}

export function IconAnkh({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      {/* Ankh loop with inner ring */}
      <ellipse cx="12" cy="6" rx="3.2" ry="4.2" stroke={color} strokeWidth="1.4" fill={color} fillOpacity="0.12" />
      <ellipse cx="12" cy="6" rx="2" ry="3" stroke={color} strokeWidth="0.6" fill="none" opacity="0.4" />
      {/* Vertical stem with decorative bands */}
      <path d="M12 10.2V21" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10.5 13h3M10.5 17h3" stroke={color} strokeWidth="0.7" strokeLinecap="round" opacity="0.5" />
      {/* Horizontal crossbar */}
      <path d="M5 14.5h14" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      {/* Crossbar end ornaments */}
      <circle cx="5" cy="14.5" r="0.6" fill={color} fillOpacity="0.5" />
      <circle cx="19" cy="14.5" r="0.6" fill={color} fillOpacity="0.5" />
      {/* Base foot */}
      <path d="M9.5 21h5" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M10 21l-.5 1.5M14 21l.5 1.5" stroke={color} strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
      {/* Top dot */}
      <circle cx="12" cy="3" r="0.6" fill={color} fillOpacity="0.4" />
    </svg>
  );
}

export function IconScroll({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      {/* Scroll body */}
      <path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4z" stroke={color} strokeWidth="1.4" fill={color} fillOpacity="0.1" strokeLinejoin="round" />
      {/* Left rolled end */}
      <path d="M6 4a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1h1" stroke={color} strokeWidth="1.4" strokeLinejoin="round" fill={color} fillOpacity="0.05" />
      {/* Right rolled end */}
      <path d="M19 18a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-1" stroke={color} strokeWidth="1.4" strokeLinejoin="round" fill={color} fillOpacity="0.05" />
      {/* Text lines with varying lengths */}
      <path d="M9 9h7M9 11.5h5.5M9 14h6M9 16.5h4" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
      {/* Decorative top border */}
      <path d="M8 6.5h8" stroke={color} strokeWidth="0.6" strokeLinecap="round" opacity="0.4" />
      {/* Wax seal at bottom right */}
      <circle cx="16.5" cy="18.5" r="1.8" stroke={color} strokeWidth="0.9" fill={color} fillOpacity="0.2" />
      <path d="M15.8 18.5h1.4M16.5 17.8v1.4" stroke={color} strokeWidth="0.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function IconQuill({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M3 21l6-6M3 21l3-1M3 21l1-3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 15c4-2 8-6 10-12-6 2-10 6-12 10l2 2z" stroke={color} strokeWidth="1.4" fill={color} fillOpacity="0.15" strokeLinejoin="round"/>
      <path d="M9 15l2 2" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

export function IconRaven({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M3 14c2-1 4-1 6 0 2-3 5-5 9-5 1 0 2 0 3 1-1 1-3 1-4 2-1 3-3 5-6 5-3 0-5-1-7-2-1 0-2 0-2 0z" stroke={color} strokeWidth="1.4" fill={color} fillOpacity="0.2" strokeLinejoin="round"/>
      <circle cx="18" cy="10" r="0.7" fill={color}/>
      <path d="M19 9l3-1" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function IconTome({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4V4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6V4z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1" strokeLinejoin="round"/>
      <path d="M7 8h2M7 11h2M15 8h2M15 11h2" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function IconTower({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M5 21V8l3-3h8l3 3v13" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1" strokeLinejoin="round"/>
      <path d="M5 8h14M5 12h14M9 21v-4h6v4" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8 5V3M12 5V3M16 5V3" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="12" cy="15" r="0.8" fill={color}/>
    </svg>
  );
}

export function IconLighthouse({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M9 21h6l-1-5h-4l-1 5zM10 16l-1-5h6l-1 5M11 11V7h2v4M11 7L9 4M13 7l2-3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill={color} fillOpacity="0.1"/>
      <circle cx="12" cy="9" r="0.8" fill={color}/>
      <path d="M4 12l2 1M20 12l-2 1M3 6l2 1M21 6l-2 1" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}

export function IconChat({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4V5z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1" strokeLinejoin="round"/>
      <path d="M8 8h8M8 11h5" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

export function IconCompass({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08"/>
      <path d="M12 6l2 6-2 6-2-6 2-6z" stroke={color} strokeWidth="1.3" fill={color} fillOpacity="0.2" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="1" fill={color}/>
    </svg>
  );
}

export function IconCrown({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.2" strokeLinejoin="round"/>
      <path d="M5 19h14" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="3" cy="7" r="1" fill={color}/>
      <circle cx="21" cy="7" r="1" fill={color}/>
      <circle cx="12" cy="5" r="1" fill={color}/>
    </svg>
  );
}

export function IconTrophy({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.15" strokeLinejoin="round"/>
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M9 14v3h6v-3M8 21h8M10 17v4M14 17v4" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

export function IconCoin({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.2"/>
      <circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.2" fill="none"/>
      <path d="M12 8v8M10 10h3a1.5 1.5 0 0 1 0 3h-3" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function IconFlame({ size = 16, className, style, color = "#c64040" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M12 2c0 4-4 5-4 10a4 4 0 0 0 8 0c0-3-2-4-2-7 0 0-2 1-2-3z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.3" strokeLinejoin="round"/>
      <path d="M12 14a2 2 0 0 0-2 2c0 1 1 2 2 2s2-1 2-2a2 2 0 0 0-2-2z" fill={color} fillOpacity="0.6"/>
    </svg>
  );
}

export function IconBook({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 0-2 2V5zM20 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 1 2 2V5z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1" strokeLinejoin="round"/>
      <path d="M8 7h2M14 7h2M8 10h2M14 10h2M8 13h2M14 13h2" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function IconKey({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <circle cx="7" cy="14" r="4" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.15"/>
      <path d="M10 12l10-10M16 4l3 3M14 6l3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function IconExit({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M16 17l5-5-5-5M21 12H9" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function IconPlay({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M7 4l13 8-13 8V4z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.3" strokeLinejoin="round"/>
    </svg>
  );
}

export function IconTwitter({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M4 4l7 9-7 7h2l6-6 4 6h4l-7-10 7-6h-2l-6 5-4-5H4z" fill={color}/>
    </svg>
  );
}

export function IconDiscord({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M19 5a16 16 0 0 0-4-1l-.3.5a12 12 0 0 1 3.5 1.2A12 12 0 0 0 5 6.7 12 12 0 0 1 8.5 5.5L8.2 5A16 16 0 0 0 4 6C2 9 1.5 13 2 17c1.5 1.2 3 2 4.5 2.5l.7-1.3c-.8-.3-1.5-.7-2.2-1.2.2-.1.4-.3.5-.4 3 1.5 6.5 1.5 9.5 0 .2.1.3.3.5.4-.7.5-1.4.9-2.2 1.2l.7 1.3c1.6-.5 3.1-1.3 4.5-2.5.6-4.6-.7-8.6-3-12z" stroke={color} strokeWidth="1.3" fill={color} fillOpacity="0.2" strokeLinejoin="round"/>
      <circle cx="9" cy="13" r="1" fill={color}/>
      <circle cx="15" cy="13" r="1" fill={color}/>
    </svg>
  );
}

export function IconSteam({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1"/>
      <circle cx="14" cy="9" r="2.5" stroke={color} strokeWidth="1.3" fill="none"/>
      <circle cx="9" cy="15" r="2" stroke={color} strokeWidth="1.3" fill="none"/>
      <path d="M9 13l5-4" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function IconYouTube({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <rect x="3" y="6" width="18" height="12" rx="3" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.15"/>
      <path d="M10 9l5 3-5 3V9z" fill={color}/>
    </svg>
  );
}

export function IconMahjong({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <rect x="5" y="3" width="14" height="18" rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1"/>
      <path d="M8 7h8M8 11h8M8 15h5" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="12" cy="19" r="0.8" fill={color}/>
    </svg>
  );
}

export function IconFrame({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <rect x="3" y="3" width="18" height="18" rx="1" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1"/>
      <path d="M3 8h18M3 16h18M8 3v18M16 3v18" stroke={color} strokeWidth="1" opacity="0.5"/>
    </svg>
  );
}

export function IconFrameThorn({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M4 4h16v16H4z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1"/>
      <path d="M4 4l2 2M4 8l2-2M4 12l2-2M4 16l2-2M4 20l2-2M8 4l-2 2M12 4l-2 2M16 4l-2 2M20 4l-2 2M20 8l-2 2M20 12l-2-2M20 16l-2-2M20 20l-2-2M8 20l2-2M12 20l-2-2M16 20l-2-2" stroke={color} strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

export function IconEmote({ size = 16, className, style, color = defaultColor }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1"/>
      <circle cx="9" cy="10" r="1" fill={color}/>
      <circle cx="15" cy="10" r="1" fill={color}/>
      <path d="M8 14a4 4 0 0 0 8 0" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}

export function IconRedCircle({ size = 16, className, style, color = "#c64040" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.3"/>
      <circle cx="12" cy="12" r="5" stroke={color} strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

export function IconClose({ size = 16, className, style, color = "#9c2828" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.15"/>
      <path d="M8 8l8 8M16 8l-8 8" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

// Faction category icon mapper
import type { FactionCategory } from "../data/factions";

export function IconSurrender({ size = 16, className, style, color = "#8a6a5a" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      {/* Fallen chess pawn — lying on its side */}
      <path d="M9 16c0-1 .5-2 1.5-2.5.5-1 .5-2 .5-3 0-1-.5-2-1.5-2.5C8.5 7.5 8 6 8.5 4.5c.5-1 2-1.5 3.5-1s2 2 1.5 3.5c-.3 1-1 1.5-1.5 2.5.5 1 .5 2 .5 3 0 1 .5 2 1.5 2.5" stroke={color} strokeWidth="1.2" strokeLinejoin="round" fill={color} fillOpacity="0.15" transform="rotate(-25 12 12)" />
      {/* Pawn base — tilted */}
      <path d="M7.5 17.5h6l-.5 1.5H8z" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.12" strokeLinejoin="round" transform="rotate(-25 12 12)" />
      {/* White flag on pole */}
      <path d="M15 3v16" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M15 4.5h5v5h-5z" stroke={color} strokeWidth="1" fill="#f0ece0" fillOpacity="0.7" strokeLinejoin="round" />
      <path d="M15 4.5c1 .8 2 .8 3 0M15 6.5c1 .8 2 .8 3 0M15 8.5c1 .8 2 .8 3 0" stroke={color} strokeWidth="0.4" opacity="0.3" />
    </svg>
  );
}

export function FactionIcon({ category, size = 16, className, style, color }: { category: FactionCategory; size?: number; className?: string; style?: CSSProperties; color?: string }) {
  switch (category) {
    case "ORDER": return <IconScales size={size} className={className} style={style} color={color} />;
    case "SHADOW": return <IconMoon size={size} className={className} style={style} color={color} />;
    case "SEEKER": return <IconSun size={size} className={className} style={style} color={color} />;
    case "TRANSCENDENT": return <IconStar size={size} className={className} style={style} color={color} />;
    case "SANCTUARY": return <IconAnkh size={size} className={className} style={style} color={color} />;
    case "COURIER": return <IconScroll size={size} className={className} style={style} color={color} />;
  }
}
