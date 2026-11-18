'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'monospace', padding: '2rem', background: '#FAF8F3', color: '#2C2825' }}>
        <div style={{ maxWidth: '500px', margin: '4rem auto', padding: '2rem', background: '#FFF', border: '1px solid #D1CCC2', borderRadius: '4px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', fontFamily: 'serif' }}>Critical Application Error</h2>
          <p style={{ fontSize: '0.85rem', color: '#6B645D', lineHeight: '1.5', marginBottom: '1.5rem' }}>
            A critical system error occurred. Our automated error monitoring has recorded the incident.
          </p>
          <button
            onClick={() => reset()}
            style={{ padding: '0.5rem 1rem', background: '#3F4E40', color: '#FFF', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
