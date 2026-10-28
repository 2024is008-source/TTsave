import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';
import {
  advertisingManifestSchema,
  advertisingPage,
  loadAdvertising,
} from '../src/services/advertising.js';
import { advertisingFixture } from './helpers/advertising.js';

const fixtures: ReturnType<typeof advertisingFixture>[] = [];
function fixture() {
  const value = advertisingFixture();
  fixtures.push(value);
  return value;
}
afterEach(() => {
  for (const value of fixtures.splice(0)) value.cleanup();
});
const settings = (extra: NodeJS.ProcessEnv = {}) =>
  parseEnvironment({ NODE_ENV: 'test', ...extra });

describe('advertising configuration', () => {
  it('ships off, accepts empty paths, and ignores configured tags with the global switch off', () => {
    expect(
      loadAdvertising(settings({ MONETAG_IPP_ENABLED: 'true', MONETAG_IPP_TAG_FILE: '' }))
        .tags,
    ).toHaveLength(0);
    expect(settings().MONETAG_MOBILE_ENABLED).toBe(false);
    expect(loadAdvertising(settings({ ADVERTISING_ENABLED: 'true' })).tags).toHaveLength(
      0,
    );
  });
  it('supports independent format switches and exact official bootstrap contents', () => {
    const files = fixture();
    const ipp = files.manifest('in-page-push'),
      vignette = files.manifest('vignette-banner');
    for (const format of ['IPP', 'VIGNETTE']) {
      const configured = loadAdvertising(
        settings({
          ADVERTISING_ENABLED: 'true',
          [`MONETAG_${format}_ENABLED`]: 'true',
          MONETAG_IPP_TAG_FILE: ipp,
          MONETAG_VIGNETTE_TAG_FILE: vignette,
        }),
      );
      expect(configured.tags).toHaveLength(1);
      const tag = configured.tags[0];
      expect(tag?.format).toBe(format === 'IPP' ? 'in-page-push' : 'vignette-banner');
      expect(tag?.code).toBe(
        readFileSync(path.join(files.directory, (tag?.format ?? '') + '.js'), 'utf8'),
      );
      expect(tag?.src).toMatch(
        /^\/advertising\/tags\/(?:in-page-push|vignette-banner)\/[a-f0-9]{64}\.js$/,
      );
    }
  });
  it('fails closed on missing, unreviewed, oversized or mismatched tag configuration', () => {
    expect(() =>
      loadAdvertising(
        settings({ ADVERTISING_ENABLED: 'true', MONETAG_IPP_ENABLED: 'true' }),
      ),
    ).toThrow(/Supply a reviewed/);
    const files = fixture();
    const filename = files.manifest('in-page-push', { reviewed: false });
    expect(() =>
      loadAdvertising(
        settings({
          ADVERTISING_ENABLED: 'true',
          MONETAG_IPP_ENABLED: 'true',
          MONETAG_IPP_TAG_FILE: filename,
        }),
      ),
    ).toThrow(/Invalid reviewed/);
    const wrong = files.manifest('vignette-banner');
    expect(() =>
      loadAdvertising(
        settings({
          ADVERTISING_ENABLED: 'true',
          MONETAG_IPP_ENABLED: 'true',
          MONETAG_IPP_TAG_FILE: wrong,
        }),
      ),
    ).toThrow(/format/);
    writeFileSync(filename, 'x'.repeat(65537));
    expect(() =>
      loadAdvertising(
        settings({
          ADVERTISING_ENABLED: 'true',
          MONETAG_IPP_ENABLED: 'true',
          MONETAG_IPP_TAG_FILE: filename,
        }),
      ),
    ).toThrow(/Invalid reviewed/);
  });
  it.each([
    '*',
    'https:',
    'https://*.example.org',
    "'unsafe-inline'",
    "'unsafe-eval'",
    'http://ads.example.org',
    'https://127.0.0.1',
    'https://localhost',
    'https://ads.example.org/path',
    'https://user:pass@ads.example.org',
    'https://ads.example.org:8443',
  ])('rejects unsafe CSP origin %s', (origin) => {
    expect(
      advertisingManifestSchema.safeParse({
        format: 'in-page-push',
        reviewed: true,
        tag: { kind: 'external', src: 'https://fixture.example.org/fixture.js' },
        csp: { scriptSrc: [origin] },
      }).success,
    ).toBe(false);
  });
  it('requires the external script origin in its reviewed allowlist and rejects duplicate zones', () => {
    const files = fixture();
    const tag = {
      kind: 'external',
      src: 'https://fixture.example.org/fixture.js',
      attributes: { 'data-fixture': 'inert' },
    };
    const ipp = files.manifest('in-page-push', { tag, csp: {} });
    expect(() =>
      loadAdvertising(
        settings({
          ADVERTISING_ENABLED: 'true',
          MONETAG_IPP_ENABLED: 'true',
          MONETAG_IPP_TAG_FILE: ipp,
        }),
      ),
    ).toThrow(/explicitly reviewed/);
    const reviewed = files.manifest('in-page-push', {
      tag,
      csp: { scriptSrc: ['https://fixture.example.org'] },
    });
    const vignette = files.manifest('vignette-banner', {
      tag,
      csp: { scriptSrc: ['https://fixture.example.org'] },
    });
    expect(() =>
      loadAdvertising(
        settings({
          ADVERTISING_ENABLED: 'true',
          MONETAG_IPP_ENABLED: 'true',
          MONETAG_VIGNETTE_ENABLED: 'true',
          MONETAG_IPP_TAG_FILE: reviewed,
          MONETAG_VIGNETTE_TAG_FILE: vignette,
        }),
      ),
    ).toThrow(/same advertising tag/);
  });
  it('rejects dangerous script attributes and unsupported formats', () => {
    for (const format of ['onclick', 'popunder', 'push-notifications', 'multitag'])
      expect(
        advertisingManifestSchema.safeParse({
          format,
          reviewed: true,
          tag: { kind: 'external', src: 'https://fixture.example.org/fixture.js' },
          csp: {},
        }).success,
      ).toBe(false);
    expect(
      advertisingManifestSchema.safeParse({
        format: 'in-page-push',
        reviewed: true,
        tag: {
          kind: 'external',
          src: 'https://fixture.example.org/fixture.js',
          attributes: { onload: 'alert(1)' },
        },
        csp: {},
      }).success,
    ).toBe(false);
  });
  it('only permits canonical editorial URLs', () => {
    for (const route of ['/', '/blog', '/blog/how-to-convert-tiktok-to-mp4'])
      expect(advertisingPage(route, route)).toBe(true);
    for (const route of [
      '/admin',
      '/login',
      '/auth',
      '/privacy',
      '/api/v1/downloads/id/file',
      '/missing',
    ])
      expect(advertisingPage(route, route)).toBe(false);
    expect(advertisingPage('/', '/?url=PRIVATE')).toBe(false);
  });
  it('example manifests contain no advertising URL or publisher identifier and cannot be enabled', () => {
    for (const format of ['in-page-push', 'vignette-banner'])
      expect(
        advertisingManifestSchema.safeParse(
          JSON.parse(
            readFileSync(`config/monetag/${format}.example.json`, 'utf8'),
          ) as unknown,
        ).success,
      ).toBe(false);
  });
  it('rejects public manifests and HTML masquerading as bootstrap JavaScript', () => {
    expect(() =>
      loadAdvertising(
        settings({
          ADVERTISING_ENABLED: 'true',
          MONETAG_IPP_ENABLED: 'true',
          MONETAG_IPP_TAG_FILE: path.resolve('public/assets/js/advertising.js'),
        }),
      ),
    ).toThrow(/Invalid reviewed/);
    const files = fixture();
    const manifest = files.manifest('in-page-push');
    writeFileSync(
      path.join(files.directory, 'in-page-push.js'),
      '<script src="not-a-tag"></script>',
    );
    expect(() =>
      loadAdvertising(
        settings({
          ADVERTISING_ENABLED: 'true',
          MONETAG_IPP_ENABLED: 'true',
          MONETAG_IPP_TAG_FILE: manifest,
        }),
      ),
    ).toThrow(/JavaScript contents/);
  });
});
