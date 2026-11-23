// Projects view. Shared data and helpers are supplied by app.js.
WaypointViews.projectsView = function ({ db, base, esc, fmtDate }) {
  function projectCard(p) {
    let ts = db.tasks.filter((t) => t.projectId === p.id),
      done = ts.filter((t) => t.status === "Completed").length,
      percent = ts.length ? Math.round((done / ts.length) * 100) : 0;
    return `<button class="project" data-project="${esc(p.id)}"><div class="meta">${esc(p.category || "Uncategorized")} · <span class="pill">${esc(p.status)}</span></div><h3>${esc(p.name)}</h3><div class="meta">${ts.length} tasks · ${done} completed · ${p.dueDate ? `Target ${fmtDate(p.dueDate)}` : "No target date"}</div><div class="progress"><div style="width:${percent}%"></div></div></button>`;
  }

  function projectsView() {
    base(
      "Projects",
      "Organize bigger goals into tasks. Standalone tasks remain independent.",
      `<div class="toolbar"><button class="btn primary" data-action="newProject">+ New project</button></div>${
        db.projects.length
          ? `<div class="project-grid">${[...db.projects]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(projectCard)
              .join("")}</div>`
          : '<div class="empty">No projects yet. Create one to group related work.</div>'
      }`,
    );
  }
  return projectsView();
};
