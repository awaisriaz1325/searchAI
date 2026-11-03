import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { PLACES, generateGoldenQueries, generateListings } from './index.ts';

const { values } = parseArgs({
  options: { count: { type: 'string', default: '1000' }, seed: { type: 'string', default: '1' }, out: { type: 'string', default: 'data' } },
});
const count = Number(values.count);
const seed = Number(values.seed);
await mkdir(values.out!, { recursive: true });
const lines = [...generateListings({ seed, count })].map((l) => JSON.stringify(l));
await writeFile(`${values.out}/listings-1k.jsonl`, lines.join('\n') + '\n');
await writeFile(`${values.out}/golden-queries.json`, JSON.stringify(generateGoldenQueries(seed), null, 1));
await writeFile(`${values.out}/places.json`, JSON.stringify(PLACES, null, 1));
console.log(`wrote ${count} listings, golden queries and places to ${values.out}/`);
