import React from 'react';

export default function BrandLogo({ size = 32, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="AuraSync"
    >
      <defs>
        <linearGradient id="auraRingGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="auraCloudGrad" x1="0.1" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#637bff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50.5" r="45" fill="none" stroke="url(#auraRingGrad)" strokeWidth="8.5" />
      <g fill="url(#auraCloudGrad)">
        <circle cx="50" cy="43" r="25" />
        <circle cx="26.5" cy="55" r="16.75" />
        <circle cx="72.5" cy="54" r="18.25" />
        <rect x="16.5" y="54" width="67" height="17" rx="8.5" />
      </g>
    </svg>
  );
}
