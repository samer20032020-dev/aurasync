import React from 'react';

/**
 * MobileCloudBackdrop
 * ====================
 * Pixel-perfect recreation of the user's aesthetic screenshot:
 * Deep sapphire midnight background with soft puffy 3D clouds at the edges
 * and a radiant cyan/blue glow shining directly behind the frosted glass card.
 */
export default function MobileCloudBackdrop({ isDark = true, children }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: 'radial-gradient(130% 130% at 50% 35%, #0f2b4c 0%, #091a32 50%, #040c19 100%)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ─── Ambient Atmospheric Blue Glow ─── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '32%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.45) 0%, rgba(37, 99, 235, 0.3) 45%, transparent 75%)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ─── Cloud 1: Large Glowing Cloud Peeking Behind Card on the Left ─── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '44%',
          left: 'calc(50% - 140px)',
          transform: 'translate(-50%, -50%)',
          width: 260,
          height: 260,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.85) 0%, rgba(37, 99, 235, 0.65) 100%)',
          boxShadow: '0 0 50px rgba(56, 189, 248, 0.5), inset -8px -8px 24px rgba(15, 23, 42, 0.4)',
          filter: 'blur(1.5px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ─── Cloud 2: Top Right Puffy 3D Cloud ─── */}
      <svg
        viewBox="0 0 200 120"
        width="210"
        height="125"
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 25,
          right: -25,
          opacity: 0.82,
          filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.3)) drop-shadow(0 0 30px rgba(56, 189, 248, 0.3))',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <defs>
          <linearGradient id="cloudGradTR" x1="30%" y1="0%" x2="70%" y2="100%">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#1e40af" stopOpacity="0.65" />
          </linearGradient>
          <linearGradient id="highlightTR" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="65" r="42" fill="url(#cloudGradTR)" />
        <circle cx="62" cy="78" r="30" fill="url(#cloudGradTR)" />
        <circle cx="138" cy="75" r="32" fill="url(#cloudGradTR)" />
        <rect x="45" y="72" width="110" height="35" rx="17" fill="url(#cloudGradTR)" />
        {/* Soft highlight curve on top */}
        <path
          d="M 66,62 C 80,38 120,38 134,62"
          fill="none"
          stroke="url(#highlightTR)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>

      {/* ─── Cloud 3: Bottom Left Puffy 3D Cloud ─── */}
      <svg
        viewBox="0 0 200 120"
        width="190"
        height="115"
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 40,
          left: -35,
          opacity: 0.85,
          filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.3)) drop-shadow(0 0 30px rgba(56, 189, 248, 0.25))',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <defs>
          <linearGradient id="cloudGradBL" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.88" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.78" />
            <stop offset="100%" stopColor="#1e40af" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="highlightBL" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="65" r="42" fill="url(#cloudGradBL)" />
        <circle cx="62" cy="78" r="30" fill="url(#cloudGradBL)" />
        <circle cx="138" cy="75" r="32" fill="url(#cloudGradBL)" />
        <rect x="45" y="72" width="110" height="35" rx="17" fill="url(#cloudGradBL)" />
        <path
          d="M 68,62 C 82,38 118,38 132,62"
          fill="none"
          stroke="url(#highlightBL)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>

      {/* ─── Foreground Application Content ─── */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
