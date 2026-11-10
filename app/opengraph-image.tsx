import { ASK_COPY } from '@/lib/copy';
import { ImageResponse } from 'next/og';

export const alt = ASK_COPY.documentTitle;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: 80,
        background: '#f6f6f3',
        color: '#121212',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 88, color: '#2443d0', marginBottom: 32 }}>
        Sourced
      </div>
      <div style={{ display: 'flex', fontSize: 36, lineHeight: 1.4 }}>
        A small, production-quality RAG app and starter kit: every claim in the answer cites a
        passage, and every citation is checked on the server before you see it.
      </div>
    </div>,
    size,
  );
}
