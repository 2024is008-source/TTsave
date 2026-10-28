import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env, type Environment } from '../config/env.js';

export const advertisingFormats = ['in-page-push', 'vignette-banner'] as const;
export type AdvertisingFormat = (typeof advertisingFormats)[number];
const httpsOrigin = z
  .string()
  .max(255)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        value === url.origin &&
        !url.port &&
        !url.username &&
        !url.password &&
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname) &&
        !/(?:^|\.)(?:localhost|local|internal|invalid|test|example|lan|home|onion)$/.test(
          url.hostname,
        )
      );
    } catch {
      return false;
    }
  }, 'Use a reviewed exact HTTPS origin, without paths, wildcards, ports or credentials.');
const origins = z.array(httpsOrigin).max(20).default([]);
export const advertisingManifestSchema = z
  .object({
    format: z.enum(advertisingFormats),
    reviewed: z.literal(true),
    tag: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('external'),
          src: z
            .url()
            .max(2048)
            .refine((value) => {
              try {
                const url = new URL(value);
                return (
                  httpsOrigin.safeParse(url.origin).success &&
                  !url.username &&
                  !url.password &&
                  !url.hash &&
                  !/[\s\p{Cc}]/u.test(value)
                );
              } catch {
                return false;
              }
            }),
          // Preserve official data attributes, but never accept handlers, styles or URLs here.
          attributes: z
            .record(z.string().regex(/^data-[a-z][a-z0-9-]{0,59}$/), z.string().max(1024))
            .default({}),
        })
        .strict(),
      z
        .object({
          kind: z.literal('bootstrap'),
          file: z
            .string()
            .refine((value) => path.isAbsolute(value) && path.extname(value) === '.js'),
        })
        .strict(),
    ]),
    csp: z
      .object({
        scriptSrc: origins,
        connectSrc: origins,
        imgSrc: origins,
        frameSrc: origins,
        styleSrc: origins,
        fontSrc: origins,
        mediaSrc: origins,
      })
      .strict(),
  })
  .strict();

export type AdvertisingTag = {
  format: AdvertisingFormat;
  src: string;
  attributes: Record<string, string>;
  code?: string;
  csp: z.infer<typeof advertisingManifestSchema>['csp'];
};
export type AdvertisingConfiguration = { tags: AdvertisingTag[]; mobileEnabled: boolean };

function privateFile(filename: string) {
  const resolved = realpathSync(filename);
  const publicRoot = realpathSync(path.resolve('public'));
  const relative = path.relative(publicRoot, resolved);
  if (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
    throw Error('Advertising files must be outside public.');
  const stat = statSync(resolved);
  if (!stat.isFile() || stat.size > 65536)
    throw Error('Advertising file must be a regular file of at most 64 KiB.');
  return readFileSync(resolved, 'utf8');
}

/** Trusted operator configuration only. No remote fetch, request input or fabricated tag. */
export function loadAdvertising(
  environment: Environment = env,
): AdvertisingConfiguration {
  const configuration: AdvertisingConfiguration = {
    tags: [],
    mobileEnabled: environment.MONETAG_MOBILE_ENABLED,
  };
  if (!environment.ADVERTISING_ENABLED) return configuration;
  const slots = [
    {
      format: 'in-page-push' as const,
      enabled: environment.MONETAG_IPP_ENABLED,
      file: environment.MONETAG_IPP_TAG_FILE,
    },
    {
      format: 'vignette-banner' as const,
      enabled: environment.MONETAG_VIGNETTE_ENABLED,
      file: environment.MONETAG_VIGNETTE_TAG_FILE,
    },
  ];
  for (const slot of slots) {
    if (!slot.enabled) continue;
    if (!slot.file)
      throw Error(
        `Supply a reviewed ${slot.format} manifest before enabling advertising.`,
      );
    // Do not include publisher code or filesystem contents in startup errors/logs.
    let manifest: z.infer<typeof advertisingManifestSchema>;
    try {
      manifest = advertisingManifestSchema.parse(
        JSON.parse(privateFile(slot.file)) as unknown,
      );
    } catch {
      throw Error(`Invalid reviewed ${slot.format} advertising manifest.`);
    }
    if (manifest.format !== slot.format)
      throw Error('Advertising manifest format does not match its setting.');
    if (manifest.tag.kind === 'external') {
      if (!manifest.csp.scriptSrc.includes(new URL(manifest.tag.src).origin))
        throw Error('Official script origin must be explicitly reviewed in scriptSrc.');
      configuration.tags.push({
        format: slot.format,
        src: manifest.tag.src,
        attributes: manifest.tag.attributes,
        csp: manifest.csp,
      });
    } else {
      let code: string;
      try {
        code = privateFile(manifest.tag.file);
      } catch {
        throw Error(`Invalid private ${slot.format} bootstrap file.`);
      }
      if (!code.trim() || /<\/?script\b/i.test(code))
        throw Error(
          'Store only the unchanged JavaScript contents of the official script tag.',
        );
      const digest = createHash('sha256').update(code).digest('hex');
      configuration.tags.push({
        format: slot.format,
        src: `/advertising/tags/${slot.format}/${digest}.js`,
        attributes: {},
        code,
        csp: manifest.csp,
      });
    }
  }
  if (
    new Set(configuration.tags.map((tag) => tag.code ?? tag.src)).size !==
    configuration.tags.length
  )
    throw Error('The same advertising tag cannot be configured in both slots.');
  return configuration;
}

export function advertisingPage(pathname: string, originalUrl: string) {
  return (
    !originalUrl.includes('?') &&
    (pathname === '/' ||
      pathname === '/blog' ||
      /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pathname))
  );
}

export function advertisingClient(
  configuration: AdvertisingConfiguration,
  pathname: string,
) {
  return {
    page: pathname,
    mobileEnabled: configuration.mobileEnabled,
    tags: configuration.tags.map(({ format, src, attributes }) => ({
      format,
      src,
      attributes,
    })),
  };
}
