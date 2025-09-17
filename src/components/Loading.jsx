// Sade, şık bir spinner gösteren yükleme bileşeni
import React from "react";

export default function Loading({ size = 120, className = "" }) {
  return (
    <div className={`loading-fallback ${className}`} style={{ width: size, height: size }}>
      <div className="loading-spinner" />
    </div>
  );
}


