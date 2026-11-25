/* Dependencies use permanent task UUIDs, so renaming or moving tasks keeps links. */
const WaypointDependencies = (() => {
  const parents = (task) => [
    ...new Set(
      Array.isArray(task.dependsOn)
        ? task.dependsOn.filter((id) => typeof id === "string")
        : [],
    ),
  ];
  const blockers = (task, tasks) =>
    parents(task).filter(
      (id) => tasks.find((t) => t.id === id)?.status !== "Completed",
    );

  function layout(tasks) {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const degrees = new Map(
      tasks.map((t) => [t.id, parents(t).filter((id) => byId.has(id)).length]),
    );
    const children = new Map(tasks.map((t) => [t.id, []]));
    for (const task of tasks)
      for (const id of parents(task))
        if (children.has(id)) children.get(id).push(task.id);
    const remaining = new Set(byId.keys()),
      levels = [];
    let layer = tasks
      .filter((t) => degrees.get(t.id) === 0)
      .map((t) => t.id)
      .sort();
    while (layer.length) {
      levels.push(layer);
      const next = [];
      for (const id of layer) {
        remaining.delete(id);
        for (const child of children.get(id)) {
          degrees.set(child, degrees.get(child) - 1);
          if (degrees.get(child) === 0) next.push(child);
        }
      }
      layer = next.sort();
    }
    if (remaining.size) levels.push([...remaining].sort());
    return { levels, cycle: remaining.size > 0 };
  }

  // Editing either side writes the same canonical prerequisite list on children.
  function link(tasks, item, parentIds, dependentIds, now) {
    const ids = new Set(tasks.map((t) => t.id));
    ids.add(item.id);
    const chosen = [...new Set([...parentIds, ...dependentIds])];
    if (chosen.includes(item.id))
      throw Error("A task cannot depend on itself.");
    if (chosen.some((id) => !ids.has(id)))
      throw Error(
        "A linked task was deleted. Reopen the editor and choose another task.",
      );
    const next = tasks
      .filter((t) => t.id !== item.id)
      .map((t) => {
        const old = parents(t);
        const updated = old.filter((id) => id !== item.id);
        if (dependentIds.includes(t.id)) updated.push(item.id);
        return JSON.stringify(old.slice().sort()) ===
          JSON.stringify(updated.slice().sort())
          ? t
          : { ...t, dependsOn: updated, updatedAt: now };
      });
    next.push({ ...item, dependsOn: [...new Set(parentIds)] });
    if (layout(next).cycle)
      throw Error(
        "These links create a dependency loop. Remove a parent or dependent link and try again.",
      );
    return next;
  }
  function connected(tasks, projectId) {
    const selected = new Set(
      tasks.filter((t) => t.projectId === projectId).map((t) => t.id),
    );
    let changed = true;
    while (changed) {
      changed = false;
      for (const task of tasks)
        for (const id of parents(task)) {
          if (selected.has(task.id) || selected.has(id)) {
            for (const key of [task.id, id])
              if (!selected.has(key)) {
                selected.add(key);
                changed = true;
              }
          }
        }
    }
    return tasks.filter((t) => selected.has(t.id));
  }
  return { parents, blockers, layout, link, connected };
})();
if (typeof module !== "undefined") module.exports = WaypointDependencies;
