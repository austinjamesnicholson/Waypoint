/* APP LOGIC: this IIFE keeps the app variables out of global scope. */
(() => {
  "use strict";
  // STORAGE: preserving this key preserves existing saved tasks on the device.
  const KEY = "waypoint.tasks.v1",
    TODAY = () => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
  // DATA MODEL: common values that appear in the task and project forms.
  const statuses = [
    "Not Started",
    "In Progress",
    "Waiting",
    "Completed",
    "Canceled",
  ];
  const priorities = ["High", "Normal", "Low"];
  const categories = [
    "Home",
    "Automotive",
    "Woodworking",
    "Software",
    "Life Admin",
    "Personal Development",
    "Other",
  ];
  const uid = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now()) + Math.random().toString(36).slice(2);
  const initial = () => ({
    version: 1,
    projects: [],
    tasks: [],
    categories: [...categories],
  });
  // STORAGE: load the database from localStorage or initialize empty records.
  function load() {
    try {
      let x = JSON.parse(localStorage.getItem(KEY));
      if (x && Array.isArray(x.tasks) && Array.isArray(x.projects))
        return { ...initial(), ...x };
    } catch (e) {}
    return initial();
  }
  let db = WaypointSync.identify(load()),
    view = "dashboard",
    search = "",
    statusFilter = "open",
    projectFilter = "",
    categoryFilter = "",
    typeFilter = "",
    dialog = null;
  let cloud = null;
  const save = () => {
    WaypointSync.identify(db);
    try {
      if (cloud?.signedIn) cloud.change(db);
      else localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      alert(
        "Unable to save on this device. Please keep this page open and try again.",
      );
    }
  };
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const project = (id) => db.projects.find((p) => p.id === id);
  const category = (t) =>
    project(t.projectId)
      ? project(t.projectId).category || "Uncategorized"
      : "Standalone";
  const type = (t) => t.type || project(t.projectId)?.type || "Want";
  const priorityOrder = { High: 0, Normal: 1, Low: 2 };
  const dateKey = (s) => s || "9999-12-31";
  // RANKING: next step date, then priority, then target finish date.
  // Blank dates go last; creation time settles remaining ties.
  function cmp(a, b) {
    return (
      dateKey(a.nextDate).localeCompare(dateKey(b.nextDate)) ||
      (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1) ||
      dateKey(a.dueDate).localeCompare(dateKey(b.dueDate)) ||
      a.createdAt.localeCompare(b.createdAt)
    );
  }
  const inactive = (t) =>
    ["Completed", "Canceled", "Waiting"].includes(t.status) ||
    ["Paused", "Someday", "Completed", "Canceled"].includes(
      project(t.projectId)?.status,
    );
  const inbox = (t) => !project(t.projectId);
  const ready = (t) => !inactive(t);
  const fmtDate = (s) =>
    s
      ? new Date(s + "T12:00:00").toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: undefined,
        })
      : "No date";
  const relative = (s) =>
    s && s < TODAY() ? "Overdue" : s === TODAY() ? "Today" : fmtDate(s);
  const count = (fn) => db.tasks.filter(fn).length;
  // RENDERING: these functions generate HTML strings from application data.
  function navItem(id, icon, name, n) {
    return `<button class="nav ${view === id ? "active" : ""}" data-view="${id}"><span>${icon}</span>${name}${n !== undefined ? `<span class="count">${n}</span>` : ""}</button>`;
  }
  function base(title, sub, content) {
    document.getElementById("app").innerHTML =
      `<aside class="sidebar"><h1 class="brand">◈ Waypoint</h1><div class="subtitle">Personal projects & tasks</div>${navItem("dashboard", "⌂", "Dashboard")}${navItem("projects", "▦", "Projects", db.projects.filter((p) => p.status === "Active").length)}${navItem(
        "tasks",
        "☷",
        "All tasks",
        count((t) => !["Completed", "Canceled"].includes(t.status)),
      )}${navItem("inbox", "◫", "Inbox", count(inbox))}${navItem("settings", "&#9881;", "Settings")}<div class="sidebar-foot">Sort: Next step date → Priority → Due date<br><br>Local storage with optional cloud sync.</div></aside><main class="main"><header class="top"><div class="top-heading"><div class="eyebrow">Waypoint / ${esc(view === "dashboard" ? "Overview" : view)}</div><h1 class="title">${esc(title)}</h1><p class="sub">${sub}</p></div><div class="top-actions"><button class="btn primary task-action" data-action="newTask">+ Task</button></div></header>${content}</main><nav class="mobile-nav">${[
        ["dashboard", "⌂", "Home"],
        ["projects", "▦", "Projects"],
        ["tasks", "☷", "Tasks"],
        ["inbox", "◫", "Inbox"],
        ["settings", "\u2699", "Settings"],
      ]
        .map(
          ([id, i, n]) =>
            `<button data-view="${id}" class="${view === id ? "active" : ""}"><b>${i}</b>${n}</button>`,
        )
        .join("")}</nav>`;
  }
  const taskLabel = (t) =>
    `${project(t.projectId)?.shorthand || "TASK"}-${String(t.taskNumber).padStart(3, "0")}`;
  function taskCard(t, i) {
    const p = project(t.projectId);
    const done = t.status === "Completed";
    return `<article class="task"><input type="checkbox" class="checkbox" ${done ? "checked" : ""} data-complete="${esc(t.id)}" aria-label="Complete ${esc(t.title)}"><div class="task-main" data-edit-task="${esc(t.id)}" role="button" tabindex="0"><div class="task-title" style="${done ? "text-decoration:line-through;opacity:.6" : ""}">${esc(t.title)}</div><div class="meta"><span class="pill">${esc(taskLabel(t))}</span><span>${esc(p?.name || category(t))}</span><span>·</span><span class="pill ${t.priority.toLowerCase()}">${esc(t.priority)}</span><span class="pill">${esc(type(t))}</span>${t.status === "Waiting" ? '<span class="pill waiting">Waiting</span>' : ""}${done ? '<span class="pill done">Completed</span>' : ""}</div>${t.nextStep ? `<p class="next">↳ ${esc(t.nextStep)}</p>` : ""}<div class="details-inline"><span class="pill">Next: ${esc(relative(t.nextDate))}</span><span class="pill">Due: ${esc(relative(t.dueDate))}</span>${t.blocker ? '<span class="pill waiting">⚠ Blocker</span>' : ""}</div></div>${i !== undefined ? `<div class="rank">${i + 1}</div>` : ""}</article>`;
  }
  function taskList(ts, empty = "Nothing here yet.") {
    return ts.length
      ? `<div class="list">${ts.map((t, i) => taskCard(t, i)).join("")}</div>`
      : `<div class="empty">${empty}</div>`;
  }
  // SCREENS: each view uses base() so the navigation and header stay consistent.

  // Each view lives in js/views; provide current data on every render.
  function dashboard() {
    return WaypointViews.dashboard({
      db,
      ready,
      cmp,
      TODAY,
      base,
      count,
      inbox,
      taskList,
    });
  }
  function projectsView() {
    return WaypointViews.projectsView({ db, base, esc, fmtDate });
  }
  function projectDetail() {
    return WaypointViews.projectDetail({
      db,
      project,
      projectFilter,
      cmp,
      base,
      esc,
      taskList,
      showProjects,
    });
  }
  function allTasks() {
    return WaypointViews.allTasks({
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
    });
  }
  function inboxView() {
    return WaypointViews.inboxView({ db, base, taskList, inbox, cmp });
  }
  function showProjects() {
    view = "projects";
    return projectsView();
  }

  function draw() {
    if (view === "dashboard") dashboard();
    else if (view === "projects") projectsView();
    else if (view === "project") projectDetail();
    else if (view === "tasks") allTasks();
    else if (view === "settings") settingsView();
    else inboxView();
  }
  const field = (name, label, value = "", type = "text", extra = "") =>
    `<div class="group ${extra}"><label for="f_${name}">${label}</label><input class="field" id="f_${name}" name="${name}" type="${type}" value="${esc(value)}"></div>`;
  const selectField = (name, label, options, value = "", extra = "") =>
    `<div class="group ${extra}"><label for="f_${name}">${label}</label><select name="${name}" id="f_${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
  const textArea = (name, label, value = "", extra = "") =>
    `<div class="group ${extra}"><label for="f_${name}">${label}</label><textarea name="${name}" id="f_${name}">${esc(value)}</textarea></div>`;
  // FULL TASK EDITOR: use this for task details, planning, and updates.
  function openTask(id = null, pid = null) {
    let t = db.tasks.find((x) => x.id === id) || {
      title: "",
      description: "",
      projectId: pid || "",
      category: "",
      type: "",
      priority: "Normal",
      status: "Not Started",
      nextStep: "",
      nextDate: "",
      dueDate: "",
      deadline: "",
      blocker: "",
      waitingFor: "",
      followUpDate: "",
      effort: "",
    };
    dialog = { type: "task", id };
    const ps = [["", "Standalone"], ...db.projects.map((p) => [p.id, p.name])];
    showModal(
      `${id ? "Edit task " + taskLabel(t) : "New task"}`,
      `<form id="item-form" class="form-grid">${field("title", "Task title", t.title, "text", "full")}${selectField("projectId", "Project", ps, t.projectId)}${selectField(
        "type",
        "Need / Want",
        [
          ["", "Inherit (Want by default)"],
          ["Need", "Need"],
          ["Want", "Want"],
        ],
        t.type,
      )}${selectField(
        "priority",
        "Priority",
        priorities.map((x) => [x, x]),
        t.priority,
      )}${selectField(
        "status",
        "Status",
        statuses.map((x) => [x, x]),
        t.status,
      )}${field("nextDate", "Next step target date", t.nextDate, "date")}${field("dueDate", "Task target finish date", t.dueDate, "date")}${field("deadline", "Hard deadline (optional)", t.deadline, "date")}${field("effort", "Estimated effort (minutes)", t.effort, "number")}${textArea("nextStep", "Next step", t.nextStep, "full")}${textArea("description", "Description / notes", t.description, "full")}${textArea("blocker", "Blocker (if any)", t.blocker, "full")}${field("waitingFor", "Waiting for", t.waitingFor)}${field("followUpDate", "Follow-up date", t.followUpDate, "date")}<div class="group full"><p class="hint">Ranking is automatic: earliest next step target date, then High → Normal → Low priority, then earliest task due date. Undated tasks come last.</p></div></form>`,
      id,
    );
  }
  // QUICK CAPTURE: just one field, saved to Inbox. Detailed planning can happen later.
  function openQuickCapture() {
    dialog = { type: "quick" };
    showModal(
      "Quick capture",
      `<form id="item-form" class="form-grid">
 ${field("title", "What do you want to remember?", "", "text", "full")}
 <p class="hint" style="grid-column:1/-1">Just enter a title. You can organize it and set dates later.</p>
 </form>`,
      null,
    );
  }
  function openProject(id = null) {
    let p = db.projects.find((x) => x.id === id) || {
      name: "",
      description: "",
      category: db.categories[0] || "",
      type: "Want",
      priority: "Normal",
      status: "Active",
      dueDate: "",
    };
    dialog = { type: "project", id };
    showModal(
      `${id ? "Edit project" : "New project"}`,
      `<form id="item-form" class="form-grid">${field("name", "Project name", p.name, "text", "full")}${field("shorthand", "Project shorthand (letters and numbers)", p.shorthand || "", "text", "full")}${selectField(
        "category",
        "Category",
        [["", "Uncategorized"], ...db.categories.map((x) => [x, x])],
        p.category,
      )}${selectField(
        "type",
        "Need / Want",
        [
          ["Need", "Need"],
          ["Want", "Want"],
        ],
        p.type,
      )}${selectField(
        "status",
        "Project status",
        ["Active", "Paused", "Someday", "Completed", "Canceled"].map((x) => [
          x,
          x,
        ]),
        p.status,
      )}${field("dueDate", "Target finish date", p.dueDate, "date")}${textArea("description", "Description / notes", p.description, "full")}</form>`,
      id,
    );
  }
  function showModal(title, form, id) {
    document.getElementById("modal-root").innerHTML =
      `<div class="dialog-backdrop" id="backdrop"><section class="dialog editor-dialog" role="dialog" aria-modal="true" aria-labelledby="dialogtitle"><div class="top" style="margin-bottom:18px"><div><h2 id="dialogtitle">${esc(title)}</h2><p class="sub">Changes save on this device and sync when signed in.</p></div><button class="btn small" data-action="close">✕ Close</button></div>${form}<div class="dialog-actions"><div>${id ? `<button class="btn danger" data-action="delete">Delete</button>` : ""}</div><div><button class="btn ghost" data-action="close">Cancel</button><button class="btn primary" data-action="save">Save</button></div></div></section></div>`;
    document
      .querySelector(
        '#item-form input[name="title"],#item-form input[name="name"]',
      )
      ?.focus();
  }
  function close() {
    dialog = null;
    document.getElementById("modal-root").innerHTML = "";
  }
  function saveDialog() {
    if (!dialog) return;
    const form = document.getElementById("item-form");
    const values = Object.fromEntries(new FormData(form).entries());
    const now = new Date().toISOString();
    const name = (
      dialog.type === "task" || dialog.type === "quick"
        ? values.title
        : values.name
    ).trim();
    if (!name) {
      alert("Please enter a name.");
      return;
    }
    if (dialog.type === "quick") {
      // Save deliberately unorganized: category and project are blank, so Inbox lists it.
      db.tasks.push({
        id: uid(),
        title: name,
        description: "",
        projectId: "",
        category: "",
        type: "",
        priority: "Normal",
        status: "Not Started",
        nextStep: "",
        nextDate: "",
        dueDate: "",
        deadline: "",
        blocker: "",
        waitingFor: "",
        followUpDate: "",
        effort: "",
        createdAt: now,
        updatedAt: now,
      });
      view = "inbox";
    } else if (dialog.type === "task") {
      let existing = db.tasks.find((t) => t.id === dialog.id);
      let item = {
        ...existing,
        ...values,
        title: name,
        effort: values.effort ? Number(values.effort) : "",
        id: existing?.id || uid(),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      delete item.category;
      if (item.status === "Completed" && existing?.status !== "Completed")
        completionSound();
      if (!existing) {
        db.tasks.push(item);
      } else {
        db.tasks = db.tasks.map((t) => (t.id === dialog.id ? item : t));
      }
      if (item.status === "Completed" && !item.completedAt)
        item.completedAt = now;
      else if (item.status !== "Completed") item.completedAt = null;
    } else {
      values.shorthand = values.shorthand.trim().toUpperCase();
      if (
        !/^[A-Z0-9]{1,12}$/.test(values.shorthand) ||
        values.shorthand === "TASK" ||
        db.projects.some(
          (p) => p.id !== dialog.id && p.shorthand === values.shorthand,
        )
      ) {
        alert(
          "Enter a unique shorthand of 1–12 letters or numbers. TASK is reserved for standalone tasks.",
        );
        return;
      }
      let existing = db.projects.find((p) => p.id === dialog.id);
      let item = {
        ...existing,
        ...values,
        name,
        id: existing?.id || uid(),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      if (!existing) db.projects.push(item);
      else
        db.projects = db.projects.map((p) => (p.id === dialog.id ? item : p));
    }
    save();
    close();
    draw();
  }
  function deleteDialog() {
    if (
      !dialog ||
      !confirm(`Delete this ${dialog.type}? This cannot be undone.`)
    )
      return;
    if (dialog.type === "task") {
      db.tasks = db.tasks.filter((t) => t.id !== dialog.id);
    } else {
      if (
        db.tasks.some((t) => t.projectId === dialog.id) &&
        !confirm(
          "This project has tasks. Keep them as standalone tasks? (Cancel leaves everything unchanged)",
        )
      )
        return;
      db.tasks.forEach((t) => {
        if (t.projectId === dialog.id) t.projectId = "";
      });
      db.projects = db.projects.filter((p) => p.id !== dialog.id);
      view = "projects";
    }
    save();
    close();
    draw();
  }
  // BACKUP: JSON download keeps task data portable, despite local-only storage.
  function exportData() {
    let json = JSON.stringify(
      { ...db, exportedAt: new Date().toISOString() },
      null,
      2,
    );
    let url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    let a = document.createElement("a");
    a.href = url;
    a.download = "waypoint-backup-" + TODAY() + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function settingsView() {
    base(
      "Settings",
      "Make Waypoint your own and keep a backup of your work.",
      `
      <section class="secondary-panel"><h2>Project categories</h2><p class="hint">Tasks use their project's category. Tasks without a project are Standalone.</p>
      <form id="category-form" class="actions"><input class="field" name="category" aria-label="New category" placeholder="New category" maxlength="80" required><button class="btn primary" type="submit">Add category</button></form>
      <div class="category-list">${db.categories.map((name, index) => `<div class="category-row"><span>${esc(name)}</span><div class="actions"><button class="btn small" aria-label="Edit ${esc(name)}" data-action="renameCategory" data-category-index="${index}">Edit</button><button class="btn small danger" aria-label="Remove ${esc(name)}" data-action="removeCategory" data-category-index="${index}">Remove</button></div></div>`).join("") || '<p class="hint">Add your first category above.</p>'}</div></section>
      <section class="secondary-panel"><h2>Data & backup</h2><p class="hint">Export downloads a backup. Import replaces your current data and syncs the replacement when signed in.</p><div class="actions"><button class="btn" data-action="export">Export JSON backup</button><button class="btn" data-action="import">Import JSON backup</button><button class="btn danger" data-action="clear">Reset all data</button></div></section>`,
    );
  }
  function categoryName(value, previous) {
    const name = value?.trim();
    if (!name) return null;
    if (
      name.toLowerCase() === "standalone" ||
      db.categories.some(
        (c) => c !== previous && c.toLowerCase() === name.toLowerCase(),
      )
    ) {
      alert(
        "Choose a unique category name. Standalone is reserved for tasks without projects.",
      );
      return null;
    }
    return name;
  }
  let audioContext;
  function completionSound() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      audioContext.resume().catch(() => {});
      const start = audioContext.currentTime;
      [659.25, 880, 1318.51].forEach((frequency, index) => {
        const tone = audioContext.createOscillator(),
          gain = audioContext.createGain(),
          at = start + index * 0.065;
        tone.type = "sine";
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.075, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.19);
        tone.connect(gain).connect(audioContext.destination);
        tone.start(at);
        tone.stop(at + 0.2);
      });
    } catch (_) {
      /* Audio must never interrupt saving. */
    }
  }
  window.addEventListener("submit", (event) => {
    if (event.target.id !== "category-form") return;
    event.preventDefault();
    const name = categoryName(new FormData(event.target).get("category"));
    if (name) {
      db.categories.push(name);
      save();
      draw();
    }
  });
  // EVENTS: one listener handles interactions on dynamically rendered screens.
  window.addEventListener("click", (e) => {
    let b = e.target.closest(
      "[data-view],[data-action],[data-project],[data-edit-task],[data-edit-project],[data-add-to-project],[data-complete]",
    );
    if (!b) {
      if (e.target.id === "backdrop") close();
      return;
    }
    if (b.dataset.view) {
      view = b.dataset.view;
      draw();
      return;
    }
    if (b.dataset.editTask) {
      openTask(b.dataset.editTask);
      return;
    }
    if (b.dataset.project) {
      projectFilter = b.dataset.project;
      view = "project";
      draw();
      return;
    }
    if (b.dataset.editProject) {
      openProject(b.dataset.editProject);
      return;
    }
    if (b.dataset.addToProject) {
      openTask(null, b.dataset.addToProject);
      return;
    }
    if (b.dataset.complete) {
      let t = db.tasks.find((t) => t.id === b.dataset.complete);
      if (t) {
        t.status = e.target.checked ? "Completed" : "Not Started";
        t.completedAt = e.target.checked ? new Date().toISOString() : null;
        t.updatedAt = new Date().toISOString();
        save();
        if (t.status === "Completed") {
          completionSound();
          b.closest(".task")?.classList.add("task-completing");
          b.disabled = true;
          setTimeout(draw, 550);
        } else draw();
      }
      return;
    }
    switch (b.dataset.action) {
      case "newTask":
        openTask(null, view === "project" ? projectFilter : null);
        break;
      case "quickCapture":
        openQuickCapture();
        break;
      case "newProject":
        openProject();
        break;
      case "close":
        close();
        break;
      case "save":
        saveDialog();
        break;
      case "delete":
        deleteDialog();
        break;
      case "showWaiting":
        statusFilter = "waiting";
        view = "tasks";
        draw();
        break;
      case "export":
        exportData();
        break;
      case "import":
        document.getElementById("import-file").click();
        break;
      case "clear":
        if (
          confirm(
            "Delete all tasks and projects? When signed in, this deletion syncs to your other devices.",
          )
        ) {
          db = initial();
          save();
          view = "dashboard";
          draw();
        }
        break;
      case "renameCategory": {
        const old = db.categories[Number(b.dataset.categoryIndex)];
        const name = categoryName(prompt("Category name", old), old);
        if (!name || name === old) break;
        db.categories = db.categories.map((c) => (c === old ? name : c));
        db.projects.forEach((p) => {
          if (p.category === old) {
            p.category = name;
            p.updatedAt = new Date().toISOString();
          }
        });
        if (categoryFilter === old) categoryFilter = name;
        save();
        draw();
        break;
      }
      case "removeCategory": {
        const old = db.categories[Number(b.dataset.categoryIndex)];
        if (
          !confirm(
            `Remove "${old}"? Projects using it will become Uncategorized. Tasks will be kept.`,
          )
        )
          break;
        db.categories = db.categories.filter((c) => c !== old);
        db.projects.forEach((p) => {
          if (p.category === old) {
            p.category = "";
            p.updatedAt = new Date().toISOString();
          }
        });
        if (categoryFilter === old) categoryFilter = "";
        save();
        draw();
        break;
      }
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dialog) close();
    if ((e.key === "Enter" || e.key === " ") && e.target.dataset.editTask) {
      e.preventDefault();
      openTask(e.target.dataset.editTask);
    }
  });
  window.addEventListener("input", (e) => {
    if (e.target.id === "search") {
      search = e.target.value;
      let pos = e.target.selectionStart;
      allTasks();
      let x = document.getElementById("search");
      x?.focus();
      x?.setSelectionRange(pos, pos);
    }
  });
  window.addEventListener("change", (e) => {
    if (e.target.id === "statusFilter") {
      statusFilter = e.target.value;
      draw();
    }
    if (e.target.id === "categoryFilter") {
      categoryFilter = e.target.value;
      draw();
    }
    if (e.target.id === "typeFilter") {
      typeFilter = e.target.value;
      draw();
    }
  });
  document
    .getElementById("import-file")
    .addEventListener("change", async (e) => {
      let f = e.target.files[0];
      if (!f) return;
      try {
        let data = JSON.parse(await f.text());
        if (!Array.isArray(data.tasks) || !Array.isArray(data.projects))
          throw Error("Not a valid backup");
        if (
          !confirm("Import this backup and replace all currently saved data?")
        )
          return;
        db = WaypointSync.identify({ ...initial(), ...data });
        save();
        view = "dashboard";
        draw();
      } catch (err) {
        alert("Import failed: " + err.message);
      }
      e.target.value = "";
    });
  // FIRST PAINT: render the default screen using loaded data.
  draw();
  cloud = WaypointCloud.create({
    initial,
    onData(data) {
      db = WaypointSync.identify(data);
      draw();
    },
    onSignedOut() {
      close();
      db = WaypointSync.identify(load());
      view = "dashboard";
      draw();
    },
  });
})();
