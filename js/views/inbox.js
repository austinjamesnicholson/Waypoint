// Inbox view. Shared data and helpers are supplied by app.js.
WaypointViews.inboxView = function ({ db, base, taskList, inbox, cmp }) {
  base(
    "Inbox",
    "Quickly capture ideas, then give them a category or project when you are ready.",
    `<div class="toolbar"><button class="btn primary" data-action="quickCapture">+ Quick capture</button></div>${taskList(db.tasks.filter(inbox).sort(cmp), "Your inbox is clear. Quick-captured tasks will appear here.")}`,
  );
};
