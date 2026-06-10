import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

// __dirname is provided by CommonJS at runtime; in tsx ESM mode it's polyfilled.
const migrationsDir = join(__dirname, '..', 'migrations');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const sql = postgres(url, { max: 1, prepare: false });

  await sql`
    create table if not exists "_migrations" (
      "id" text primary key,
      "applied_at" timestamptz not null default now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const existing = await sql`select 1 from "_migrations" where id = ${id}`;
    if (existing.length > 0) {
      console.log(`✓ ${id} already applied`);
      continue;
    }

    console.log(`→ applying ${id}`);
    const body = await readFile(join(migrationsDir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into "_migrations" (id) values (${id})`;
    });
    console.log(`✓ ${id} applied`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
