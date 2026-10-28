import { z } from 'zod';
import { operationsStore, rangeSchema } from './services/operational-analytics.js';
import { ga4Reports } from './services/ga4-reports.js';

// Local operator command only. There is deliberately no HTTP reporting endpoint.
const argumentsSchema = z.array(z.string()).max(2);
const [from, to] = argumentsSchema.parse(process.argv.slice(2));
const range = rangeSchema.parse({ from, to });
const store = operationsStore(true);
try {
  const operations = store?.report(range);
  const today = new Date().toISOString().slice(0, 10);
  const start =
    range.from ?? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  if (
    start > (range.to ?? today) ||
    Date.parse(range.to ?? today) - Date.parse(start) > 729 * 86400000
  )
    throw Error('Choose an ordered range of up to 730 days.');
  const google = await ga4Reports(start, range.to ?? today);
  process.stdout.write(
    JSON.stringify({ operations: operations ?? { enabled: false }, google }, null, 2) +
      '\n',
  );
} finally {
  store?.close();
}
