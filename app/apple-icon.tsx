import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { getSiteLogoUrl } from '@/lib/content/getSiteLogoUrl';

// iOS home-screen icon. Apple ignores transparency and applies its own
// rounded-corner mask, so this is a solid, full-bleed square.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// Same resolution logic as app/icon.tsx (see that file's comment for why
// uploaded logos skip the background/padding treatment the static fallback
// gets) — kept duplicated rather than shared, since Next's metadata file
// convention requires each of these files to have its own default export
// with no shared imports beyond plain helpers, and this one function is
// small enough that extracting a shared module isn't worth the indirection
// for two call sites.
async function resolveLogo(): Promise<{ src: string; isUpload: boolean }> {
  const adminUrl = await getSiteLogoUrl();
  if (adminUrl) return { src: adminUrl, isUpload: true };

  const buffer = await readFile(path.join(process.cwd(), 'public', 'logo.png'));
  return { src: `data:image/png;base64,${buffer.toString('base64')}`, isUpload: false };
}

export default async function AppleIcon() {
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
          // Always solid, even for an uploaded logo — unlike app/icon.tsx,
          // iOS ignores any transparency in this specific icon and fills
          // transparent regions with its own (usually black) default, so a
          // deliberately transparent background here would backfire.
          background: '#16181d',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders via satori, not the DOM; next/image doesn't apply here */}
        <img
          src={logoSrc}
          width={isUpload ? size.width : size.width * 0.8}
          height={isUpload ? size.height : size.height * 0.8}
          style={{ objectFit: 'contain' }}
        />
      </div>
    ),
    { ...size }
  );
}
