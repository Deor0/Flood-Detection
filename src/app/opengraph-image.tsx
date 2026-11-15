import { ImageResponse } from 'next/og';

export const alt = 'Poseidon Surge — find your way home';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social card for every page that does not set its own: brand, promise and the three tools. */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: 'linear-gradient(160deg, #0b1f3a 0%, #13336b 60%, #2b4fc7 100%)',
        color: '#ffffff',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 28,
          letterSpacing: 8,
          color: '#19c3e8',
          fontWeight: 700,
        }}
      >
        POSEIDON SURGE
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 80, fontWeight: 700, lineHeight: 1.05 }}>
          Find your way home.
        </div>
        <div style={{ display: 'flex', fontSize: 34, marginTop: 24, color: '#dfeaf6' }}>
          Every family&apos;s road back to Ithaca.
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 28, color: '#dfeaf6' }}>
        Check your river · Find your people · Call or text with no internet
      </div>
    </div>,
    size,
  );
}
