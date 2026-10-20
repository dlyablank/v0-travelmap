import { Client } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL first.');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(91833721)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS "_weekend_migrations" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
    const dirs = (await readdir('prisma/migrations', { withFileTypes: true }))
      .filter((x) => x.isDirectory())
      .map((x) => x.name)
      .sort();
    for (const name of dirs) {
      const sql = await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query(
        'SELECT checksum FROM "_weekend_migrations" WHERE name=$1',
        [name],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== hash)
          throw new Error(`Applied migration ${name} changed.`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO "_weekend_migrations" (name,checksum) VALUES ($1,$2)', [
        name,
        hash,
      ]);
      console.log(`Applied ${name}`);
    }
    await client.query('COMMIT');
    console.log('Database ready.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
