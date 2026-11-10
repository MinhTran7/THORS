const STAR = 'M0-10C1-3 3-1 10 0 3 1 1 3 0 10-1 3-3 1-10 0-3-1-1-3 0-10z';
const FLOWER =
  'M170.1 62A16.2 16.2 0 0 1 157.8 91.8A16.2 16.2 0 0 1 128 104.1A16.2 16.2 0 0 1 98.2 91.8A16.2 16.2 0 0 1 85.9 62A16.2 16.2 0 0 1 98.2 32.2A16.2 16.2 0 0 1 128 19.9A16.2 16.2 0 0 1 157.8 32.2A16.2 16.2 0 0 1 170.1 62z';

const STARS = [
  [538, 84, 1.1],
  [214, 300, 1],
  [546, 262, 1.7],
  [256, 424, 0.9],
  [516, 420, 1.1],
  [560, 170, 0.7, '#FFE27A']
];

export function ThorsLogo({ size = 40 }) {
  return (
    <svg width={size} height={size * 0.94} viewBox="0 0 140 134" aria-hidden="true">
      <rect x="49" y="62" width="22" height="70" rx="11" fill="#1F2937" />
      <path d="M71 84c14 0 22 4 28 12" fill="none" stroke="#1F2937" strokeWidth="3.5" strokeLinecap="round" />
      <path
        d="M96 92l12-6h22a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4h-22l-12-6z"
        fill="#FFD43B"
        stroke="#1F2937"
        strokeWidth="5.5"
        strokeLinejoin="round"
      />
      <circle cx="104" cy="104" r="3.5" fill="#1F2937" />
      <path d="M24 6h72l14 14v30l-14 14H24L10 50V20z" fill="#FF7FAA" stroke="#1F2937" strokeWidth="7" strokeLinejoin="round" />
      <path d="M27 16h66l6 6" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Logo chuẩn của Google và Facebook cho nút đăng nhập mạng xã hội
export const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
    />
    <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93z" />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
    />
  </svg>
);

export const FacebookIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#0866FF" />
    <path
      fill="#fff"
      d="m16.67 15.47.53-3.47h-3.33V9.75c0-.95.47-1.88 1.96-1.88h1.51V4.92s-1.37-.23-2.69-.23c-2.74 0-4.52 1.66-4.52 4.67V12H7.08v3.47h3.05v8.39a12 12 0 0 0 3.75 0v-8.39z"
    />
  </svg>
);

// Hình trang trí: tag THORS treo ngay dưới chữ cuối của tiêu đề
export default function ShopAuthArt() {
  return (
    <svg className="shop-auth__art" viewBox="200 40 360 430" aria-hidden="true">
      <defs>
        <linearGradient id="shopRibbon" x1="0" x2="1">
          <stop offset="0" stopColor="#3E4C85" />
          <stop offset="1" stopColor="#5566A6" />
        </linearGradient>
        <filter id="shopShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#6B4A30" floodOpacity="0.16" />
        </filter>
      </defs>

      <g transform="translate(285 150) rotate(6) scale(1.1)">
        <path
          d="M82 46C74 10 64-22 68-54C71-80 95-80 98-54C100-22 93 10 87 46"
          fill="none"
          stroke="url(#shopRibbon)"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <rect x="0" y="40" width="140" height="196" rx="4" fill="#FBD3DF" filter="url(#shopShadow)" />
        <g opacity="0.35" stroke="#F4AFC6" strokeWidth="1.5" fill="none">
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${8 + i * 15} 70l6 8 6-8M${8 + i * 15} 82l6 8 6-8`} />
          ))}
        </g>
        <text x="70" y="150" textAnchor="middle" className="shop-auth__art-brand">
          THORS
        </text>
        <text x="70" y="172" textAnchor="middle" className="shop-auth__art-tagline">
          STYLE · EVERYDAY
        </text>
        <circle cx="128" cy="62" r="54" fill="#F3EFE8" filter="url(#shopShadow)" />
        <path d={FLOWER} fill="#E7849F" />
        <circle cx="96" cy="40" r="5" fill="#F3EFE8" />
        <g transform="rotate(-20 128 62)" fill="#fff" textAnchor="middle">
          <text x="128" y="58" className="shop-auth__art-thanks">
            thank you!
          </text>
          <text x="128" y="76" className="shop-auth__art-small">
            for shopping
          </text>
        </g>
      </g>

      {STARS.map(([x, y, s, color = '#FFD43B']) => (
        <path key={`${x}-${y}`} d={STAR} transform={`translate(${x} ${y}) scale(${s})`} fill={color} />
      ))}
    </svg>
  );
}
