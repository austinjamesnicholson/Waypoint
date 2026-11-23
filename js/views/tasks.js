// Tasks view. Shared data and helpers are supplied by app.js.
WaypointViews.allTasks = function ({
  db,
  cmp,
  statusFilter,
  categoryFilter,
  typeFilter,
  search,
  ready,
  category,
  type,
  project,
  esc,
  base,
  taskList,
}) {
  let ts = [...db.tasks].sort(cmp).filter((t) => {
    if (statusFilter === "open" && ["Completed", "Canceled"].includes(t.status))
      return false;
    if (statusFilter === "waiting" && t.status !== "Waiting") return false;
    if (statusFilter === "completed" && t.status !== "Completed") return false;
    if (statusFilter === "ready" && !ready(t)) return false;
    if (categoryFilter && category(t) !== categoryFilter) return false;
    if (typeFilter && type(t) !== typeFilter) return false;
    return (
      !search ||
      [
        t.title,
        t.description,
        t.nextStep,
        t.blocker,
        project(t.projectId)?.name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  });
  let opts = (arr, sel) =>
    arr
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}" ${sel === value ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
  base(
    "All tasks",
    "Full inventory, including standalone tasks and tasks within projects.",
    `<div class="toolbar"><input id="search" class="field search" placeholder="Search tasks…" value="${esc(search)}" aria-label="Search tasks"><select id="statusFilter" aria-label="Filter by status">${opts(
      [
        ["open", "All open"],
        ["ready", "Ranked / ready"],
        ["waiting", "Waiting"],
        ["completed", "Completed"],
        ["all", "All statuses"],
      ],
      statusFilter,
    )}</select><select id="categoryFilter" aria-label="Filter category">${opts([["", "All categories"], ["Inbox", "Inbox"], ...db.categories.map((x) => [x, x])], categoryFilter)}</select><select id="typeFilter" aria-label="Filter need or want">${opts(
      [
        ["", "Need & Want"],
        ["Need", "Need"],
        ["Want", "Want"],
      ],
      typeFilter,
    )}</select></div><div class="filter-summary">${ts.length} matching tasks · Ranked by next step date, priority, then due date</div>${taskList(ts, "No tasks match these filters.")}`,
  );
};
