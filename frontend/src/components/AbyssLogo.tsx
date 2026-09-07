import React from 'react';

interface AbyssLogoProps {
  size?: number;
}

/**
 * Static AbyssGPT mark: a gradient ring around a soft core.
 * Pure SVG, no animation, no extra dependencies (calm by design).
 */
export const AbyssLogo: React.FC<AbyssLogoProps> = ({ size = 18 }) => {
  return (
    <svg
      className="abyss-logo"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="abyssLogoRing" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8b7bff" />
          <stop offset="50%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#8b7bff" />
        </linearGradient>
        <radialGradient id="abyssLogoCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#efeeff" />
          <stop offset="100%" stopColor="#a29bfe" />
        </radialGradient>
      </defs>
      <circle
        className="abyss-logo-ring"
        cx="16"
        cy="16"
        r="12.5"
        stroke="url(#abyssLogoRing)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="46 32"
        fill="none"
      />
      <circle className="abyss-logo-core" cx="16" cy="16" r="5" fill="url(#abyssLogoCore)" />
    </svg>
  );
};
