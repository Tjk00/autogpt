import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
const config = parse(
  readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
);
const database = config.d1_databases.find((value) => value.binding === 'DB');
if (
  !database ||
  !/^[a-f0-9-]{36}$/i.test(database.database_id) ||
  /^0+-0+-0+-0+-0+$/.test(database.database_id)
) {
  console.error(
    'Deployment blocked: create a real D1 database and replace the local placeholder ID in wrangler.jsonc. See README.md.',
  );
  process.exit(1);
}
