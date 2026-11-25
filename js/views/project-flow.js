// A local SVG + HTML chart works offline and keeps task nodes keyboard accessible.
WaypointViews.projectFlow = function ({
  db,
  project,
  projectFilter,
  base,
  esc,
  taskLabel,
  showProjects,
}) {
  const p = project(projectFilter);
  if (!p) return showProjects();
  const tasks = WaypointDependencies.connected(db.tasks, p.id);
  const { levels, cycle } = WaypointDependencies.layout(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const width = Math.max(
    280,
    ...levels.map((level) => level.length * 248 + 24),
  );
  const height = Math.max(160, levels.length * 166 + 24);
  const positions = new Map();
  levels.forEach((level, row) =>
    level.forEach((id, col) =>
      positions.set(id, {
        x: (width - level.length * 248) / 2 + col * 248 + 12,
        y: row * 166 + 12,
      }),
    ),
  );
  const edges = tasks
    .flatMap((t) =>
      WaypointDependencies.parents(t)
        .filter((id) => positions.has(id))
        .map((id) => {
          const a = positions.get(id),
            b = positions.get(t.id),
            x1 = a.x + 112,
            y1 = a.y + 112,
            x2 = b.x + 112,
            y2 = b.y;
          return `<path d="M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}" marker-end="url(#flow-arrow)"/>`;
        }),
    )
    .join("");
  const nodes = tasks
    .map((t) => {
      const { x, y } = positions.get(t.id),
        blocked = WaypointDependencies.blockers(t, db.tasks).length;
      const names = WaypointDependencies.parents(t).map(
        (id) => byId.get(id)?.title || "Deleted task",
      );
      return `<button class="flow-node ${t.status === "Completed" ? "is-done" : blocked ? "is-blocked" : ""}" style="left:${x}px;top:${y}px" data-edit-task="${esc(t.id)}" aria-label="${esc(taskLabel(t) + ": " + t.title + (names.length ? ". Depends on " + names.join(", ") : ". No parents"))}"><span class="flow-id">${esc(taskLabel(t))}${t.projectId !== p.id ? " · Other project" : ""}</span><strong>${esc(t.title)}</strong><span>${esc(t.status)}${blocked && t.status !== "Completed" ? " · Blocked" : ""}</span></button>`;
    })
    .join("");
  // Phones use full-width stages rather than shrinking a wide canvas.
  const mobile = levels
    .map(
      (level, index) =>
        `<section class="flow-stage" aria-labelledby="flow-stage-${index}"><h2 id="flow-stage-${index}">Stage ${index + 1}</h2>${level.length > 1 ? '<p class="hint">These tasks share a stage; follow their parent links below.</p>' : ""}<div class="flow-stage-tasks">${level
          .map((id) => {
            const t = byId.get(id),
              blocked = WaypointDependencies.blockers(t, db.tasks).length;
            const parentIds = WaypointDependencies.parents(t);
            return `<article class="flow-mobile-card" id="flow-task-${esc(t.id)}"><button class="flow-mobile-node ${t.status === "Completed" ? "is-done" : blocked ? "is-blocked" : ""}" data-edit-task="${esc(t.id)}"><span class="flow-id">${esc(taskLabel(t))}${t.projectId !== p.id ? " · Other project" : ""}</span><strong>${esc(t.title)}</strong><span>${esc(t.status)}${blocked && t.status !== "Completed" ? " · Blocked" : ""}</span></button><div class="flow-parent-links"><span>${parentIds.length ? "After:" : "No prerequisites"}</span>${parentIds
              .map((parentId) => {
                const parent = byId.get(parentId);
                return parent
                  ? `<button class="flow-parent-link" data-flow-jump="${esc(parentId)}" aria-label="Go to parent ${esc(taskLabel(parent))}">${esc(taskLabel(parent))} · ${esc(parent.title)}</button>`
                  : "<span>Deleted parent task</span>";
              })
              .join("")}</div></article>`;
          })
          .join("")}</div></section>`,
    )
    .join("");
  base(
    p.name + " / Task flow",
    "Parents come before dependents. Select a task to edit its links.",
    `<div class="actions"><button class="btn ghost" data-action="projectTasks">Back to project</button></div>${cycle ? '<p class="notice" role="alert">A dependency loop was found, possibly from offline edits. Edit the linked tasks to remove the loop.</p>' : ""}${tasks.length ? `<p class="hint">Green: completed · Amber: waiting on parents. Connected tasks from other projects are included. Follow the stages from top to bottom. On phones, parent links jump to the linked task.</p><div class="flow-mobile" aria-label="Task dependency flowchart">${mobile}</div><div class="flow-viewport flow-desktop" tabindex="0" role="region" aria-label="Task dependency flowchart"><div class="flow-canvas" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}" aria-hidden="true"><defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"/></marker></defs><g class="flow-edges">${edges}</g></svg>${nodes}</div></div>` : '<div class="empty">Add tasks to this project to build its flowchart.</div>'}`,
  );
};
