import React from 'react';

export default function Hero({ title, subtitle }) {
  return (
    <div className="hero">
      <div className="hero-container">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
