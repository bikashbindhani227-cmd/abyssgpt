import React, { useId } from 'react';

export interface AbyssLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

/**
 * Animated AbyssGPT mark: an intricate cosmic singularity featuring:
 * - A breathing ambient aura
 * - A counter-rotating outer dashed orbital track
 * - A high-energy spinning vortex ring with a cyan-indigo-purple gradient
 * - A counter-rotating inner orbital track
 * - Orbiting celestial quantum sparks
 * - A radiant breathing core singularity
 *
 * Scoped gradient IDs via useId ensure safe multi-instance rendering.
 */
export const AbyssLogo: React.FC<AbyssLogoProps> = ({
  size = 18,
  className = '',
  animated = true,
}) => {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ringGradId = `abyss-ring-${rawId}`;
  const coreGradId = `abyss-core-${rawId}`;
  const auraGradId = `abyss-aura-${rawId}`;

  return (
    <svg
      className={`abyss-logo ${animated ? '' : 'static'} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        {/* Dynamic Gradient for Vortex Ring */}
        <linearGradient id={ringGradId} x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="35%" stopColor="#6366f1" />
          <stop offset="70%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>

        {/* Ambient Nebula Radial Glow */}
        <radialGradient id={auraGradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#a855f7" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>

        {/* Singularity Core Gradient */}
        <radialGradient id={coreGradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#e0e7ff" />
          <stop offset="75%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4f46e5" />
        </radialGradient>
      </defs>

      {/* Soft Ambient Aura */}
      <circle
        className={animated ? 'abyss-logo-ambient' : undefined}
        cx="20"
        cy="20"
        r="17"
        fill={`url(#${auraGradId})`}
      />

      {/* Outer Orbital Track (Counter-Clockwise) */}
      <circle
        className={animated ? 'abyss-logo-ring-outer' : undefined}
        cx="20"
        cy="20"
        r="14.8"
        stroke="#818cf8"
        strokeWidth="1.2"
        strokeDasharray="4 6"
        opacity="0.45"
        fill="none"
      />

      {/* Main High-Energy Spinning Vortex Ring (Clockwise) */}
      <circle
        className={animated ? 'abyss-logo-ring-main' : undefined}
        cx="20"
        cy="20"
        r="11.4"
        stroke={`url(#${ringGradId})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeDasharray="46 26"
        fill="none"
      />

      {/* Inner Concentric Orbit (Counter-Clockwise) */}
      <circle
        className={animated ? 'abyss-logo-ring-inner' : undefined}
        cx="20"
        cy="20"
        r="7.4"
        stroke="#a855f7"
        strokeWidth="1"
        strokeDasharray="2.5 3.5"
        opacity="0.6"
        fill="none"
      />

      {/* Orbiting Quantum Sparks (Clockwise) */}
      <g className={animated ? 'abyss-logo-spark-group' : undefined}>
        <circle cx="20" cy="8.6" r="1.5" fill="#38bdf8" />
        <circle cx="28.2" cy="28.2" r="1.2" fill="#c084fc" />
      </g>

      {/* Counter-Orbiting Quantum Spark (Counter-Clockwise) */}
      <g className={animated ? 'abyss-logo-spark-counter' : undefined}>
        <circle cx="11.8" cy="23.5" r="1.1" fill="#67e8f9" />
      </g>

      {/* Radiant Core Singularity (Breathing Pulse) */}
      <g className={animated ? 'abyss-logo-core' : undefined}>
        <circle cx="20" cy="20" r="4.6" fill={`url(#${coreGradId})`} />
        <circle cx="20" cy="20" r="1.8" fill="#ffffff" opacity="0.95" />
      </g>
    </svg>
  );
};
