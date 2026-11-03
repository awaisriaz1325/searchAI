import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSql } from './client.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** Applies every migrations/*.sql file not yet recorded, in filename order. */
export async function migrate(url: string): Promise<string[]> {
  const sql = createSql(url, { max: 1 });
  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`;
    const done = new Set((await sql`SELECT name FROM _migrations`).map((r) => r.name as string));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const applied: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const body = await readFile(MIGRATIONS_DIR + file, 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
      applied.push(file);
    }
    return applied;
  } finally {
    await sql.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai';
  console.log('applied:', await migrate(url));
}

/** Drops and recreates database `name` on the server behind `adminUrl`, migrates it, returns its URL. */
export async function recreateDatabase(adminUrl: string, name: string): Promise<string> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`invalid database name: ${name}`);
  const admin = createSql(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = adminUrl.replace(/\/[^/]+$/, `/${name}`);
  await migrate(url);
  return url;
}
