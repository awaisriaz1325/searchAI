import postgres from 'postgres';
import { createSql, migrate } from '../src/index.ts';

export const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/searchai';

/** Creates (or recreates) an isolated database for one test file and migrates it. */
export async function freshDb(name: string) {
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = ADMIN_URL.replace(/\/[^/]+$/, `/${name}`);
  await migrate(url);
  return { url, sql: createSql(url) };
}

export const vec = (fill: number, dim = 384) => `[${Array(dim).fill(fill).join(',')}]`;
