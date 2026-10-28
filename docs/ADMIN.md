# Private administration

The dashboard is implemented in Express/EJS/TypeScript. It is disabled until the
operator configures credentials. It creates no default account and changes no
public navigation, design, download limits, GA4 collector or advertising placement.

## Configure access

Run `npm run admin:password` in a private interactive terminal. Enter and confirm
a unique password of 12–256 characters. Input is hidden. The command prints a
salted scrypt hash, not the password. Password arguments/environment input and
noninteractive use are refused; never put a real password in shell history.

Run this before removing development dependencies, because the npm script uses
`tsx`. After a successful build, `node dist/admin-password.js` is the equivalent
interactive command and needs only production dependencies. Neither command
edits `.env`, creates an account or restarts the service.

Set these in the existing private `.env`, owned by the PM2 user, mode 0600:

```dotenv
ADMIN_ENABLED=true
ADMIN_USERNAME=your-chosen-username
# Paste the generated hash, enclosed in single quotes; never use plaintext.
ADMIN_PASSWORD_HASH=
ADMIN_SESSION_TTL_MINUTES=30
ADMIN_SESSION_MAX_HOURS=8
```

The empty hash above is deliberately not usable. Enabling admin without a valid
generated hash and username fails startup. Username characters: letters, digits,
period, underscore, `@`, `+`, hyphen; length 3–128. Hash values contain `$`, so
single-quote them in `.env` and never interpolate them in shell commands. Do not
publish the hash. No actual `.env` or credentials were generated/configured by the
implementation task.

Build with `npm run check`. In an isolated local development environment, start
with `npm run dev` and visit `/admin`. Production must use `NODE_ENV=production`
behind HTTPS on `https://tiksavemp4.online`; Node remains on loopback port 3000.
Never expose a development admin server. A production process restart requires
the owner's deployment permission; changing `.env` alone does not reload it.
Check PM2 environment precedence privately: inherited process variables override
Node's env-file values. Never dump `.env` or `pm2 env` into shared logs.

## Routes and security

| Route                     | Behavior                                                                  |
| ------------------------- | ------------------------------------------------------------------------- |
| `GET /admin/login`        | Sign-in form with anonymous session and synchronizer CSRF token           |
| `POST /admin/login`       | Validated credentials + CSRF + origin checks; rotate session on success   |
| `GET /admin`              | Authenticated dashboard; optional `from`/`to` UTC dates, maximum 730 days |
| `GET /admin/api/overview` | Same authorization and date validation; private JSON reports              |
| `POST /admin/logout`      | Authenticated, CSRF-protected revocation; clear cookie                    |

When disabled, admin routes return 404. When enabled, unauthenticated page requests
redirect to login; private API requests return 401. Logout has no GET mutation.
Cookies are HttpOnly, SameSite=Strict, path `/admin`; production additionally uses
Secure and the `__Secure-ttsave_admin` name. Production cookie security does not
depend on a visitor-supplied forwarding header.

Sessions are opaque random 256-bit identifiers, with only their digest retained
in a bounded server-side map. Defaults: 30-minute idle expiration, eight-hour
absolute expiration, ten-minute anonymous lifetime, 500 total sessions. Logout
revokes the server record, and a restart revokes all sessions. A known anonymous
cookie cannot access reports after authentication rotates it. The dashboard is
designed for the existing **one PM2 fork**; do not cluster it without shared
session/rate-limit storage and a separate review.

Passwords use Node scrypt with random 128-bit salts, N=32768, r=8, p=3, a 64-byte
derived key, bounded memory and two concurrent hashing operations. Username/hash
comparisons avoid direct secret string comparison. Login attempts are limited to
five per IP per 15 minutes; login-page requests to 30/minute; authenticated reports
to 30/minute, in addition to application limits. Correct proxy IP handling is
therefore necessary. The application accepts no hardcoded/default credentials.

CSRF tokens are random, session-bound, required on login and logout, and compared
in constant time. Cross-site Fetch Metadata or an unapproved Origin is rejected.
The admin referrer policy is `same-origin`: cross-origin navigation sends no
referrer while same-origin forms retain a verifiable Origin. `no-referrer` was
tested and rejected for these forms because Chrome makes the POST Origin null.

Every admin response is noindex and private/no-store, including redirects,
authorization failures and disabled routes. Dashboard/login pages use their own
EJS head: no public theme/downloader/GA4/Monetag scripts. CSP disallows scripts,
external resources and framing. Responses never include source URLs, signed
download capabilities, credentials, raw logs or private filesystem paths.
Generic credential errors do not reveal whether a username exists. Do not place
the admin path behind a public CDN cache. Consider an additional reviewed access
gateway or IP restriction for operator-only access; this task installs no VPS rule.

## Download statistics and storage

To collect operational statistics, configure the existing store explicitly:

```dotenv
OPERATIONS_ENABLED=true
OPERATIONS_DATA_DIR=/var/lib/tiksavemp4/operations
OPERATIONS_RETENTION_DAYS=30
```

Reuse any existing directory/key/database. Do not rotate `OPERATIONS_SECRET`,
delete `operations.key`, reset history or recreate an existing database for admin
setup. If no secret is configured, the established store generates its private
key only when first enabled. Back up its key and SQLite database consistently,
including any WAL/SHM sidecars when quiesced. No database migration was introduced.

The dashboard reuses that collector and its read-side report method. Per-media
attempt/delivery/failure aggregation includes retained daily archives without
double-counting. Existing distribution/totals contracts remain. Server job counts
are not unique users, and server delivery does not prove a file was saved to a
device. Date totals cover the selected UTC range, not invented lifetime history.
Detailed errors/country rows are limited by existing retention; daily aggregates
can persist up to 730 days. The tracking start date is shown.

Unknown server countries are `XX`. Keep `TRUST_COUNTRY_HEADER=false` until a
reviewed trusted proxy overwrites geography and visitors cannot reach Node
directly. This feature does not add an IP geolocation service or promise to track
every visitor. Missing/disabled data is marked unavailable, not invented as zero.

System reports show current process memory/uptime, existing service queue metrics,
backend readiness, actual tool checks, filesystem capacity/free bytes and managed
temporary-file usage. Tool/storage checks are shared and cached for 30 seconds.
Temporary scanning is read-only, streams directory entries, skips symlinks and
unrelated files, and is bounded by time/directory/file limits; partial results are
labelled. An absent root is unavailable and is not created by monitoring. No
cleanup or remote TikTok request runs merely from opening the dashboard. Readiness
and encoder availability do not guarantee current upstream availability.

## Authorized GA4 reports

Retain the existing measurement ID and consent/event configuration. Dashboard
report reading separately requires `GA4_PROPERTY_ID` (numeric), a private
`GA4_SERVICE_ACCOUNT_FILE`, enabled Analytics Data API and Viewer access for that
account on the property. Follow [ANALYTICS.md](ANALYTICS.md). No Google credentials
were supplied or added by this task.

The dashboard uses the existing read-only reporting service, showing returned
Overview and Countries reports only. It does not run Google collection scripts
on admin pages or infer visitor/country counts from download jobs. Sensitive page
paths/acquisition strings are not exposed by this interface. Missing credentials
or API failures produce an explicit unavailable message. Google processing delays,
thresholds and visitor consent affect reports. Authenticated live property data
remains an operator check until actual credentials are available.

## Verification and recovery

Run `npm run check`, `npm run format:check`, `npm run test:ui` and `npm audit`.
Regression coverage includes salted passwords, bad configuration, idle/absolute
expiry, bounded session storage, forged/stale cookies, session rotation, login
rate limits, CSRF/cross-site rejection, private response headers, production
cookie flags, report integrity, mobile layouts, keyboard login/logout and axe.
Test passwords/data exist only in isolated fixtures and are not real accounts.

For a forgotten password, generate a new hash in a private terminal, update the
private configuration and use an explicitly authorized restart. This revokes
existing sessions but does not touch analytics history or media storage. To
disable access, set `ADMIN_ENABLED=false` and restart only after permission.
Keep the previous reviewed artifact/configuration and use the release rollback
procedure. Data remains compatible; sessions and in-flight download capabilities
are not restart-resumable.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html),
[session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[CSRF synchronizer tokens](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html).
