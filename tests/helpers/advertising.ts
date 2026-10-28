import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AdvertisingFormat } from '../../src/services/advertising.js';

/** Inert test code, not a publisher tag. Never contacts an advertising provider. */
export function advertisingFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'ttsave-advertising-fixture-'));
  const manifest = (
    format: AdvertisingFormat,
    override: Record<string, unknown> = {},
  ) => {
    const file = path.join(directory, format + '.js');
    writeFileSync(
      file,
      `/* Inert test fixture, not Monetag code. */\ndocument.documentElement.dataset['${format === 'in-page-push' ? 'fixtureIpp' : 'fixtureVignette'}'] = 'loaded';\n`,
    );
    const filename = path.join(directory, format + '.json');
    writeFileSync(
      filename,
      JSON.stringify({
        format,
        reviewed: true,
        tag: { kind: 'bootstrap', file },
        csp: {},
        ...override,
      }),
    );
    return filename;
  };
  return {
    directory,
    manifest,
    cleanup() {
      if (
        path.dirname(directory) !== path.resolve(tmpdir()) ||
        !path.basename(directory).startsWith('ttsave-advertising-fixture-')
      )
        throw Error('Unsafe fixture cleanup.');
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
