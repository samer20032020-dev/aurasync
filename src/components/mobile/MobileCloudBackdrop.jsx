import React from 'react';

/**
 * MobileCloudBackdrop
 * ====================
 * High-end aesthetic frosted blurred background with a luminous glowing blue cloud backdrop.
 * Creates an ultra-premium, atmospheric, and immersive visual identity for AuraSync Mobile.
 */
export default function MobileCloudBackdrop({ isDark = true, children }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: isDark
          ? 'radial-gradient(120% 120% at 50% 15%, #0a1128 0%, #060913 55%, #03050a 100%)'
          : 'radial-gradient(120% 120% at 50% 15%, #ebf4ff 0%, #f1f5f9 60%, #e2e8f0 100%)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ─── Glowing Blue Cloud Behind UI (خلفية سحابة زرقاء متوهجة وجميلة) ─── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '4%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 640,
          height: 580,
          pointerEvents: 'none',
          zIndex: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Layer 1: Ambient Cyan Bloom (Diffuse outer aura) */}
        <div
          style={{
            position: 'absolute',
            width: 380,
            height: 340,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.32) 0%, rgba(14, 165, 233, 0.18) 45%, transparent 70%)',
            filter: 'blur(75px)',
            transform: 'translateY(-20px)',
          }}
        />

        {/* Layer 2: Deep Electric Azure Core Cloud (Center glow) */}
        <div
          style={{
            position: 'absolute',
            width: 320,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(37, 99, 235, 0.48) 0%, rgba(59, 130, 246, 0.25) 50%, transparent 75%)',
            filter: 'blur(55px)',
          }}
        />

        {/* Layer 3: Royal Sapphire Atmosphere */}
        <div
          style={{
            position: 'absolute',
            width: 440,
            height: 260,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(99, 102, 241, 0.28) 0%, transparent 70%)',
            filter: 'blur(65px)',
            transform: 'translateY(60px)',
          }}
        />

        {/* Layer 4: Stylized Luminous Cloud Vector with Soft Pulse & Rim Glow */}
        <svg
          viewBox="0 0 400 240"
          width="360"
          height="220"
          style={{
            position: 'relative',
            opacity: isDark ? 0.92 : 0.65,
            filter: 'drop-shadow(0 0 28px rgba(37, 99, 235, 0.55)) drop-shadow(0 0 60px rgba(6, 182, 212, 0.35))',
            animation: 'auraCloudPulse 7s ease-in-out infinite alternate',
          }}
        >
          <defs>
            <linearGradient id="cloudBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
              <stop offset="45%" stopColor="#2563eb" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.2" />
            </linearGradient>

            <linearGradient id="cloudRimGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.85" />
            </linearGradient>

            <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Cloud Volume */}
          <g filter="url(#softGlow)">
            {/* Center dome */}
            <circle cx="200" cy="115" r="75" fill="url(#cloudBodyGrad)" />
            {/* Left dome */}
            <circle cx="130" cy="140" r="55" fill="url(#cloudBodyGrad)" />
            {/* Right dome */}
            <circle cx="270" cy="135" r="60" fill="url(#cloudBodyGrad)" />
            {/* Base pill */}
            <rect x="100" y="145" width="200" height="50" rx="25" fill="url(#cloudBodyGrad)" />
          </g>

          {/* Luminous Neon Rim */}
          <path
            d="M 100,170 
               C 85,170 75,155 75,140 
               C 75,115 95,95 120,95 
               C 125,95 130,97 135,100
               C 145,65 175,45 205,45 
               C 240,45 270,68 278,102 
               C 285,100 292,98 300,98 
               C 325,98 345,118 345,142 
               C 345,160 332,170 315,170 
               Z"
            fill="none"
            stroke="url(#cloudRimGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />

          {/* Internal highlight arcs */}
          <path
            d="M 155,75 C 170,58 195,52 215,55"
            fill="none"
            stroke="#a5f3fc"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M 105,115 C 115,103 130,98 142,102"
            fill="none"
            stroke="#a5f3fc"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.45"
          />
        </svg>

        {/* Ambient floating light micro-particles */}
        <div
          style={{
            position: 'absolute',
            top: 140,
            left: '20%',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: '#67e8f9',
            boxShadow: '0 0 10px #67e8f9',
            opacity: 0.8,
            animation: 'auraFloat 4s ease-in-out infinite alternate',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 90,
            right: '22%',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#38bdf8',
            boxShadow: '0 0 12px #38bdf8',
            opacity: 0.9,
            animation: 'auraFloat 5s ease-in-out infinite alternate-reverse',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 220,
            right: '30%',
            width: 3,
            height: 3,
            borderRadius: '50%',
            background: '#818cf8',
            boxShadow: '0 0 8px #818cf8',
            opacity: 0.7,
            animation: 'auraFloat 6s ease-in-out infinite alternate',
          }}
        />
      </div>

      {/* ─── Frosted Glass Blur Overlay (الطبقة الضبابية الفاخرة) ─── */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(3px)', // Gentle blur over the background cloud
          WebkitBackdropFilter: 'blur(3px)',
        }}
      >
        {children}
      </div>

      <style>{`
        @keyframes auraCloudPulse {
          0% {
            transform: scale(0.97) translateY(0px);
            filter: drop-shadow(0 0 24px rgba(37, 99, 235, 0.45)) drop-shadow(0 0 50px rgba(6, 182, 212, 0.25));
          }
          100% {
            transform: scale(1.03) translateY(-8px);
            filter: drop-shadow(0 0 36px rgba(37, 99, 235, 0.7)) drop-shadow(0 0 75px rgba(6, 182, 212, 0.45));
          }
        }
        @keyframes auraFloat {
          0% { transform: translateY(0px) scale(0.9); opacity: 0.5; }
          100% { transform: translateY(-12px) scale(1.2); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
