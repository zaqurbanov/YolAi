import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { getSiteLogoUrl } from '@/lib/content/getSiteLogoUrl';

// PWA install prompts (Android/Chrome) look for 192x192 and 512x512 icons in
// the manifest; generateImageMetadata lets one file serve both sizes instead
// of needing separate icon files. See app/manifest.ts for how these are
// referenced.
export function generateImageMetadata() {
  return [
    { contentType: 'image/png', size: { width: 192, height: 192 }, id: '192' },
    { contentType: 'image/png', size: { width: 512, height: 512 }, id: '512' },
  ];
}

// Same source as NavBar/Sidebar's logo (lib/content/getSiteLogoUrl.ts) —
// admin-uploaded logos are already a full Supabase Storage URL usable
// directly as an <img src>; the static public/logo.png fallback has to be
// read from disk and base64-inlined instead, since satori (what
// ImageResponse renders through) has no access to this app's own dev/prod
// server to fetch a relative path from.
//
// The two sources need different treatment: the static fallback is a bare
// monogram shape with no background of its own, so it's composited onto a
// brand-colored square and inset with padding. An admin-uploaded logo is
// assumed to already be a complete, self-contained square icon (its own
// background/colors/wordmark, as a real designed asset would be) — wrapping
// that in a *second*, differently-colored background and shrinking it with
// padding just produces mismatched letterboxing around someone else's
// finished design. So an uploaded logo fills the entire canvas with no
// extra background layered behind it.
async function resolveLogo(): Promise<{ src: string; isUpload: boolean }> {
  const adminUrl = await getSiteLogoUrl();
  if (adminUrl) return { src: adminUrl, isUpload: true };

  const buffer = await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  return { src: `data:image/png;base64,${buffer.toString('base64')}`, isUpload: false };
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const iconId = await id;
  const size = iconId === '512' ? 512 : 192;
  const { src: logoSrc, isUpload } = await resolveLogo();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isUpload ? 'rgba(0,0,0,0)' : '#7c93f2',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders via satori, not the DOM; next/image doesn't apply here */}
        <img
          src={logoSrc}
          width={isUpload ? size : size * 0.78}
          height={isUpload ? size : size * 0.78}
          style={{ objectFit: 'contain' }}
        />
      </div>
    ),
    { width: size, height: size }
  );
}
