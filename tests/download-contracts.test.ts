import { describe, expect, it } from 'vitest';
import {
  accessTokenSchema,
  apiErrorSchema,
  apiProgressSchema,
} from '../src/api/contracts.js';
import { progressSchema } from '../src/frontend/contracts.js';

describe('shared download boundaries', () => {
  it('accepts source-reported progress without inventing missing values', () => {
    for (const value of [
      {},
      { phase: 'converting' },
      { phase: 'downloading', percent: 0, downloadedBytes: 0 },
      { percent: 100, speedBytesPerSecond: 0.5, sizeBytes: 1024 },
    ]) {
      expect(apiProgressSchema.parse(value)).toEqual(value);
      expect(progressSchema.parse(value)).toEqual(value);
    }
  });

  it.each([
    { phase: 'completed' },
    { percent: 101 },
    { percent: -1 },
    { percent: Number.NaN },
    { speedBytesPerSecond: Infinity },
    { downloadedBytes: 0.5 },
    { sizeBytes: -1 },
  ])('rejects invalid server and browser progress: %j', (value) => {
    expect(apiProgressSchema.safeParse(value).success).toBe(false);
    expect(progressSchema.safeParse(value).success).toBe(false);
  });

  it('keeps opaque capability validation and error envelopes unchanged', () => {
    expect(accessTokenSchema.parse('a'.repeat(43))).toBe('a'.repeat(43));
    for (const invalid of ['a'.repeat(42), 'a'.repeat(44), '/'.repeat(43)])
      expect(accessTokenSchema.safeParse(invalid).success).toBe(false);
    const error = {
      code: 'FORMAT_NOT_FOUND',
      message: 'Choose a format returned by analysis.',
      retryable: false,
      fieldErrors: { formatId: ['Unknown format'] },
      requestId: 'request-fixture',
    };
    expect(apiErrorSchema.parse({ error })).toEqual({ error });
    expect(
      apiErrorSchema.safeParse({ error: { ...error, fieldErrors: null } }).success,
    ).toBe(false);
  });
});
