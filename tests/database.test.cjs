const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
test("database enforces account privacy, authentication, and stale-write protection", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
    `);
    await pg.exec(fs.readFileSync("supabase/schema.sql", "utf8"));
    await pg.exec(
      `set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';`,
    );
    const save = (revision, data) =>
      pg.query(
        "select public.save_waypoint_document($1, $2::jsonb) as result",
        [revision, JSON.stringify(data)],
      );
    const data = {
      version: 1,
      tasks: [{ id: "a", title: "Private" }],
      projects: [],
      categories: [],
    };
    const created = await save(0, data);
    assert.equal(created.rows[0].result.revision, 1);
    await assert.rejects(save(0, data), (error) => error.code === "40001");
    await save(1, { ...data, tasks: [] });
    await assert.rejects(save(1, data), (error) => error.code === "40001");
    await pg.exec(
      `set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';`,
    );
    assert.equal(
      (await pg.query("select * from public.waypoint_documents")).rows.length,
      0,
    );
    await assert.rejects(
      pg.query(
        `insert into public.waypoint_documents(user_id,data) values ('00000000-0000-0000-0000-000000000001', $1)`,
        [data],
      ),
      /row-level security/,
    );
    await assert.rejects(save(2, data), (error) => error.code === "40001");
    await save(0, data);
    assert.equal(
      (await pg.query("select * from public.waypoint_documents")).rows.length,
      1,
    );
    await pg.exec(`set request.jwt.claim.sub = '';`);
    await assert.rejects(save(0, data), (error) => error.code === "28000");
    await pg.exec("reset role; set role anon;");
    await assert.rejects(
      pg.query("select * from public.waypoint_documents"),
      /permission denied/,
    );
    await assert.rejects(save(0, data), /permission denied/);
  } finally {
    await pg.close();
  }
});
