import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/** Pooled postgres.js client. Notices are silenced (DROP IF EXISTS etc.). */
export function createSql(url: string, opts: { max?: number } = {}): Sql {
  return postgres(url, { max: opts.max ?? 10, onnotice: () => {}, prepare: true });
}

/**
 * Runs `fn` in one transaction as a Supabase-style role, so row-level security applies.
 * `uid` is exposed to policies through auth.uid().
 */
export async function asRole<T>(
  sql: Sql,
  role: 'anon' | 'authenticated',
  uid: string | null,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${role === 'anon' ? 'anon' : 'authenticated'}`);
    await tx`SELECT set_config('request.jwt.claim.sub', ${uid ?? ''}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
