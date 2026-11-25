const { test } = require("node:test");
const assert = require("node:assert/strict");
const D = require("../js/dependencies.js");
const task = (id, projectId = "p", dependsOn = []) => ({
  id,
  projectId,
  dependsOn,
  status: "Not Started",
});

test("links edited from either side use one prerequisite list and can be removed", () => {
  const tasks = [task("a"), task("b"), task("c")];
  const linked = D.link(tasks, tasks[0], [], ["b", "c"], "now");
  assert.deepEqual(D.parents(linked.find((t) => t.id === "b")), ["a"]);
  assert.deepEqual(D.parents(linked.find((t) => t.id === "c")), ["a"]);
  assert.deepEqual(tasks[1].dependsOn, []);
  const removed = D.link(
    linked,
    linked.find((t) => t.id === "b"),
    [],
    [],
    "later",
  );
  assert.deepEqual(D.parents(removed.find((t) => t.id === "b")), []);
  assert.deepEqual(D.parents(removed.find((t) => t.id === "c")), ["a"]);
});
test("self links, deleted targets, and transitive dependency loops are rejected", () => {
  const tasks = [task("a"), task("b", "p", ["a"]), task("c", "p", ["b"])];
  assert.throws(() => D.link(tasks, tasks[0], ["c"], ["b"], "now"), /loop/);
  assert.throws(() => D.link(tasks, tasks[0], ["a"], [], "now"), /itself/);
  assert.throws(
    () => D.link(tasks, tasks[0], ["missing"], [], "now"),
    /deleted/,
  );
});
test("all parents must finish; missing and canceled prerequisites remain blockers", () => {
  const tasks = [task("a"), task("b"), task("c", "p", ["a", "b", "missing"])];
  tasks[0].status = "Completed";
  tasks[1].status = "Canceled";
  assert.deepEqual(D.blockers(tasks[2], tasks), ["b", "missing"]);
});
test("flow includes connected tasks across projects and layers branches and joins", () => {
  const tasks = [
    task("a", "other"),
    task("b", "p", ["a"]),
    task("c", "p", ["a"]),
    task("d", "p", ["b", "c"]),
    task("unrelated", "other"),
  ];
  const visible = D.connected(tasks, "p");
  assert.equal(visible.length, 4);
  assert.deepEqual(D.layout(visible), {
    levels: [["a"], ["b", "c"], ["d"]],
    cycle: false,
  });
});
test("a cycle introduced by separate offline edits is reported without hanging", () => {
  assert.equal(
    D.layout([task("a", "p", ["b"]), task("b", "p", ["a"])]).cycle,
    true,
  );
  assert.deepEqual(D.layout([]), { levels: [], cycle: false });
});
