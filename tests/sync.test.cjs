const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, merge } = require("../js/sync.js");
const empty = () => ({
  version: 1,
  tasks: [],
  projects: [],
  categories: ["Home"],
});
const task = (id, title = id) => ({ id, title });
const clone = (value) => JSON.parse(JSON.stringify(value));
function server() {
  const rows = new Map();
  let fail = false,
    afterRead = null,
    afterWrite = null;
  const request = (fn) => ({ abortSignal: async () => fn() });
  return {
    rows,
    set fail(value) {
      fail = value;
    },
    set afterRead(fn) {
      afterRead = fn;
    },
    set afterWrite(fn) {
      afterWrite = fn;
    },
    client(id) {
      return {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                request(() => {
                  if (fail)
                    return { error: { message: "Network unavailable" } };
                  const data = rows.has(id) ? clone(rows.get(id)) : null;
                  const hook = afterRead;
                  afterRead = null;
                  hook?.();
                  return { data };
                }),
            }),
          }),
        }),
        rpc: (_, { expected_revision, document }) =>
          request(() => {
            if (fail) return { error: { message: "Network unavailable" } };
            const current = rows.get(id);
            if ((current?.revision || 0) !== expected_revision)
              return { error: { code: "40001" } };
            const data = {
              revision: expected_revision + 1,
              data: clone(document),
            };
            rows.set(id, data);
            const hook = afterWrite;
            afterWrite = null;
            hook?.();
            return { data: clone(data) };
          }),
      };
    },
  };
}
function device(server, id = "alice", storage = new Map()) {
  let data, state;
  const engine = create({
    client: server.client(id),
    initial: empty,
    namespace: "test",
    storage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
    onData: (next) => (data = next),
    onStatus: (next) => (state = next),
  });
  engine.setUser({ id });
  return {
    engine,
    storage,
    get data() {
      return data;
    },
    get state() {
      return state;
    },
    edit(next) {
      data = clone(next);
      engine.change(next);
    },
  };
}
test("fresh device downloads cloud data without uploading an empty document", async () => {
  const db = server();
  db.rows.set("alice", {
    revision: 4,
    data: { ...empty(), tasks: [task("one")] },
  });
  const phone = device(db);
  await phone.engine.sync();
  assert.equal(phone.data.tasks.length, 1);
  assert.equal(db.rows.get("alice").revision, 4);
});
test("different offline edits and deletions combine across two devices", async () => {
  const db = server();
  const phone = device(db),
    pc = device(db);
  phone.edit({ ...empty(), tasks: [task("one"), task("two")] });
  await phone.engine.sync();
  await pc.engine.sync();
  phone.edit({ ...phone.data, tasks: [task("two")] });
  pc.edit({ ...pc.data, tasks: [task("one"), task("two", "Edited on PC")] });
  await phone.engine.sync();
  await pc.engine.sync();
  await phone.engine.sync();
  assert.deepEqual(phone.data.tasks, [task("two", "Edited on PC")]);
});
test("same-item conflict pauses uploads and resolves without losing unrelated changes", async () => {
  const db = server(),
    phone = device(db),
    pc = device(db);
  phone.edit({ ...empty(), tasks: [task("one")] });
  await phone.engine.sync();
  await pc.engine.sync();
  phone.edit({
    ...phone.data,
    tasks: [task("one", "Phone"), task("new-phone")],
  });
  pc.edit({ ...pc.data, tasks: [task("one", "PC"), task("new-pc")] });
  await phone.engine.sync();
  await pc.engine.sync();
  assert.equal(pc.state.state, "conflict");
  await pc.engine.resolve("cloud");
  assert.equal(pc.state.state, "saved");
  assert.deepEqual(
    new Set(pc.data.tasks.map((t) => t.title)),
    new Set(["Phone", "new-phone", "new-pc"]),
  );
});
test("delete versus edit is a conflict; choosing local can preserve deletion", () => {
  const base = { ...empty(), tasks: [task("one")] },
    local = empty(),
    remote = { ...empty(), tasks: [task("one", "Changed")] };
  assert.deepEqual(merge(base, local, remote).conflicts, ["tasks/one"]);
  assert.deepEqual(merge(base, local, remote, "local").data.tasks, []);
  assert.deepEqual(
    merge(base, local, remote, "cloud").data.tasks,
    remote.tasks,
  );
});
test("offline queue survives page reload and retries after network failure", async () => {
  const db = server(),
    first = device(db);
  db.fail = true;
  first.edit({ ...empty(), tasks: [task("offline")] });
  await first.engine.sync();
  assert.equal(first.state.state, "error");
  assert.equal(first.engine.pending, true);
  const restored = device(db, "alice", first.storage);
  db.fail = false;
  await restored.engine.sync();
  assert.equal(db.rows.get("alice").data.tasks[0].id, "offline");
});
test("stale revision retries instead of overwriting another device", async () => {
  const db = server(),
    phone = device(db);
  phone.edit({ ...empty(), tasks: [task("phone")] });
  db.afterRead = () =>
    db.rows.set("alice", {
      revision: 1,
      data: { ...empty(), tasks: [task("pc")] },
    });
  await phone.engine.sync();
  assert.equal(phone.state.state, "saved");
  assert.deepEqual(
    new Set(db.rows.get("alice").data.tasks.map((t) => t.id)),
    new Set(["phone", "pc"]),
  );
});
test("edits during an upload remain queued and are sent in the next iteration", async () => {
  const db = server(),
    phone = device(db);
  phone.edit({ ...empty(), tasks: [task("one")] });
  db.afterWrite = () =>
    phone.edit({ ...empty(), tasks: [task("one", "Newer")] });
  await phone.engine.sync();
  assert.equal(db.rows.get("alice").data.tasks[0].title, "Newer");
  assert.equal(phone.engine.pending, false);
});
test("sign-out during a request discards its response; caches are separated by account", async () => {
  const db = server(),
    phone = device(db);
  phone.edit({ ...empty(), tasks: [task("private")] });
  db.afterRead = () => phone.engine.setUser(null);
  await phone.engine.sync();
  assert.equal(db.rows.size, 0);
  phone.engine.setUser({ id: "bob" });
  assert.deepEqual(phone.data.tasks, []);
  phone.engine.setUser({ id: "alice" });
  assert.equal(phone.data.tasks[0].id, "private");
});
test("storage failures are reported instead of falsely claiming local durability", () => {
  const engine = create({
    client: {},
    namespace: "test",
    initial: empty,
    storage: {
      getItem: () => null,
      setItem: () => {
        throw Error("Storage full");
      },
    },
    onData() {},
    onStatus() {},
  });
  engine.setUser({ id: "alice" });
  assert.throws(
    () => engine.change({ ...empty(), tasks: [task("one")] }),
    /Storage full/,
  );
});
