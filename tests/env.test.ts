import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '../src/config/env.js';

describe('environment configuration', () => {
  it('provides safe defaults', () => {
    expect(parseEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      TRUST_PROXY: false,
    });
  });

  it('rejects an invalid port', () => {
    expect(() => parseEnvironment({ PORT: '70000' })).toThrow(
      'Invalid environment configuration',
    );
  });
});
