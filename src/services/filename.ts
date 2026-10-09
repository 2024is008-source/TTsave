/** Download labels only: temporary paths always use fixed server-owned names. */
export function downloadFilename(
  title: string,
  creator: string | null,
  extension: 'mp4' | 'mp3' | 'jpg' | 'png' | 'webp',
  position?: number,
): string {
  const clean = (value: string) =>
    value
      .normalize('NFC')
      .replace(/#[\p{L}\p{N}_]+/gu, '')
      .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
  const titleStem = clean(title);
  const image = position !== undefined;
  const fallback = image
    ? 'tiktok-photo'
    : extension === 'mp3'
      ? 'tiktok-audio'
      : 'tiktok-video';
  let stem = titleStem
    ? [clean(creator ?? ''), titleStem].filter(Boolean).join('-')
    : fallback;
  // Bound UTF-8 bytes (filesystem limit), preserving whole Unicode code points.
  let bounded = '';
  for (const character of stem) {
    if (Buffer.byteLength(bounded + character) > 160) break;
    bounded += character;
  }
  stem = bounded.replace(/-+$/g, '') || fallback;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `tiktok-${stem}`;
  return `${stem}${image ? `-${String(position).padStart(2, '0')}` : ''}.${extension}`;
}

export function attachmentHeader(filename: string): string {
  const safe = filename.replace(/[\p{Cc}\p{Cf}"\\/]/gu, '-');
  const ascii = safe
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-');
  const encoded = encodeURIComponent(safe).replace(
    /['()*]/g,
    (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
