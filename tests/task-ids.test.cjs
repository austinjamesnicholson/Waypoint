const { test } = require("node:test");
const assert = require("node:assert/strict");
const { identify, merge } = require("../js/sync.js");
const fresh = () => ({
  version: 1,
  categories: [],
  projects: [{ id: "p", name: "Garden", shorthand: "GRDN" }],
  tasks: [],
});
test("IDs backfill, survive deletion, and change groups when moved", () => {
  const d = fresh();
  d.tasks = [
    { id: "a", projectId: "p" },
    { id: "b", projectId: "p" },
    { id: "c", projectId: "" },
  ];
  identify(d);
  assert.deepEqual(
    d.tasks.map((t) => t.taskNumber),
    [1, 2, 1],
  );
  d.tasks = d.tasks.filter((t) => t.id !== "b");
  d.tasks.push({ id: "d", projectId: "p" });
  identify(d);
  assert.equal(d.tasks.find((t) => t.id === "d").taskNumber, 3);
  d.tasks.find((t) => t.id === "c").projectId = "p";
  identify(d);
  assert.equal(d.tasks.find((t) => t.id === "c").taskNumber, 4);
});
test("offline additions reconcile duplicate numbers without project conflicts", () => {
  const base = identify(fresh()),
    local = structuredClone(base),
    remote = structuredClone(base);
  local.tasks.push({ id: "a", projectId: "p" });
  remote.tasks.push({ id: "b", projectId: "p" });
  identify(local);
  identify(remote);
  const one = merge(base, local, remote),
    two = merge(base, remote, local);
  assert.deepEqual(one.conflicts, []);
  const numbers = (d) =>
    Object.fromEntries(d.tasks.map((t) => [t.id, t.taskNumber]));
  assert.deepEqual(numbers(one.data), numbers(two.data));
  assert.equal(new Set(one.data.tasks.map((t) => t.taskNumber)).size, 2);
});
