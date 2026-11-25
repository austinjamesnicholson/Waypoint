// Project Detail view. Shared data and helpers are supplied by app.js.
WaypointViews.projectDetail = function ({
  db,
  project,
  projectFilter,
  cmp,
  base,
  esc,
  taskList,
  showProjects,
}) {
  let p = project(projectFilter);
  if (!p) {
    return showProjects();
  }
  let ts = db.tasks.filter((t) => t.projectId === p.id).sort(cmp);
  base(
    p.name,
    `${esc(p.shorthand)} · ${esc(p.category || "Uncategorized")} · ${esc(p.status)} · ${ts.length} tasks`,
    `<div class="actions"><button class="btn ghost" data-view="projects">← All projects</button><button class="btn" data-edit-project="${esc(p.id)}">Edit project</button><button class="btn" data-action="projectFlow">Task flowchart</button></div>${p.description ? `<p class="sub" style="margin-top:15px">${esc(p.description)}</p>` : ""}<div class="section-head"><h2>Project tasks</h2><small>Same ranking rules</small></div>${taskList(ts, "Add your first task to this project.")}`,
  );
};
