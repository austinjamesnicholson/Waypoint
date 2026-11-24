// Dashboard view. Shared data and helpers are supplied by app.js.
WaypointViews.dashboard = function ({
  db,
  ready,
  cmp,
  TODAY,
  base,
  count,
  inbox,
  taskList,
}) {
  let ranked = db.tasks.filter(ready).sort(cmp),
    waiting = db.tasks.filter((t) => t.status === "Waiting"),
    upcoming = db.tasks.filter(
      (t) => ready(t) && t.nextDate && t.nextDate > TODAY(),
    );
  base(
    "Dashboard",
    "",
    `<div class="metrics">
      <div class="metric">
        <span>Ready to work on</span>
        <strong>${ranked.length}</strong>
      </div>
      <div class="metric">
        <span>Waiting</span>
        <strong>${waiting.length}</strong>
      </div>
      <div class="metric">
        <span>Unsorted inbox</span>
        <strong>${count(inbox)}</strong>
      </div>
      <div class="metric">
        <span>Active projects</span>
        <strong>${db.projects.filter((p) => p.status === "Active").length}</strong>
      </div>
    </div>
    <div class="section-head">
      <h2>Ranked work queue</h2>
      <small>Next step date → Priority → Due date</small>
    </div>
    ${taskList(ranked, "No ranked tasks yet. Add a task or organize your inbox to get started.")}
    <div class="section-head"><h2>Needs attention</h2></div>
    <div class="secondary-panel"><div class="meta">${count(inbox)} inbox · ${waiting.length} waiting · ${upcoming.length} with future next-step targets</div><div class="actions" style="margin-top:12px">
    <button class="btn small" data-view="inbox">Organize inbox</button>
    <button class="btn small" data-action="showWaiting">View waiting</button>
    </div>
  </div>`,
  );
};
