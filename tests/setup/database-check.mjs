import assert from 'node:assert/strict';
import { test } from 'node:test';
import postgres from 'postgres';

const database = 'postgres://sourced:sourced@localhost:5433/';
test('TC-012: T-04 local extension migration, HNSW and test database', async () => {
  const sql = postgres(`${database}sourced`, { max: 1, prepare: false });
  const testSql = postgres(`${database}sourced_test`, { max: 1, prepare: false });
  try {
    const [extension] = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
    assert.ok(extension, 'vector extension must be installed by the migration');
    const [major, minor] = extension.extversion.split('.').map(Number);
    assert.ok(major > 0 || minor >= 8, 'pgvector >= 0.8.0');
    await sql`CREATE TEMP TABLE sourced_hnsw_probe (embedding vector(3))`;
    await sql`CREATE INDEX ON sourced_hnsw_probe USING hnsw (embedding vector_cosine_ops)`;
    const [row] = await testSql`SELECT current_database() AS name`;
    assert.equal(row.name, 'sourced_test');
  } finally {
    await sql.end();
    await testSql.end();
  }
});
