/* Cloud sync engine. Also loaded by the Node tests without a browser. */
const WaypointSync = (() => {
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const equal = (a, b) => {
    const normalize = (v) =>
      Array.isArray(v)
        ? v.map(normalize)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, normalize(v[k])]),
            )
          : v;
    return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  };
  // Keep human-readable identifiers separate from permanent internal UUIDs.
  function identify(data) {
    const usedPrefixes = new Set(["TASK"]);
    for (const p of [...data.projects].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      let prefix =
        String(p.shorthand || p.name || "PRJ")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 12) || "PRJ";
      const stem = prefix;
      for (let n = 2; usedPrefixes.has(prefix); n++) prefix = stem + n;
      usedPrefixes.add(prefix);
      p.shorthand = prefix;
    }
    const groups = new Map();
    for (const t of data.tasks) {
      const key = data.projects.some((p) => p.id === t.projectId)
        ? t.projectId
        : "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    for (const [key, tasks] of groups) {
      const p = data.projects.find((p) => p.id === key);
      let high = Math.max(
        p?.taskSequence || 0,
        data.taskSequence?.[key] || 0,
        ...tasks.map((t) =>
          t.numberProject === key && Number.isSafeInteger(t.taskNumber)
            ? t.taskNumber
            : 0,
        ),
      );
      const used = new Set();
      for (const t of tasks.sort((a, b) => a.id.localeCompare(b.id))) {
        if (
          t.numberProject !== key ||
          !Number.isSafeInteger(t.taskNumber) ||
          t.taskNumber < 1 ||
          used.has(t.taskNumber)
        ) {
          t.taskNumber = ++high;
          t.numberProject = key;
        }
        used.add(t.taskNumber);
      }
      data.taskSequence ||= {};
      data.taskSequence[key] = high;
    }
    return data;
  }
  function merge(base, local, remote, prefer = "local") {
    const conflicts = [];
    const choose = (old, ours, theirs, path) => {
      if (equal(ours, theirs) || equal(old, theirs)) return ours;
      if (equal(old, ours)) return theirs;
      conflicts.push(path);
      return prefer === "cloud" ? theirs : ours;
    };
    const result = { ...remote };
    for (const collection of ["tasks", "projects"]) {
      const maps = [base, local, remote].map(
        (db) => new Map(db[collection].map((item) => [item.id, item])),
      );
      result[collection] = [...new Set(maps.flatMap((map) => [...map.keys()]))]
        .map((id) =>
          choose(...maps.map((map) => map.get(id)), `${collection}/${id}`),
        )
        .filter((item) => item !== undefined);
    }
    result.categories = choose(
      base.categories,
      local.categories,
      remote.categories,
      "categories",
    );
    result.version = 1;
    if (local.taskSequence || remote.taskSequence) {
      result.taskSequence = {};
      for (const key of new Set([
        ...Object.keys(local.taskSequence || {}),
        ...Object.keys(remote.taskSequence || {}),
      ])) {
        result.taskSequence[key] = Math.max(
          local.taskSequence?.[key] || 0,
          remote.taskSequence?.[key] || 0,
        );
      }
    }
    // Offline additions may both have chosen the next number. Reconcile in UUID
    // order so every device reaches the same unique numbers after merging.
    if (
      result.projects.some((p) => p.shorthand) ||
      result.tasks.some((t) => t.taskNumber)
    )
      identify(result);
    return { data: copy(result), conflicts };
  }
  function valid(data) {
    return (
      data &&
      ["tasks", "projects", "categories"].every((key) =>
        Array.isArray(data[key]),
      ) &&
      ["tasks", "projects"].every((key) =>
        data[key].every((item) => item && typeof item.id === "string"),
      )
    );
  }
  function create({
    client,
    storage,
    namespace,
    initial,
    onData,
    onStatus,
    online = () => true,
  }) {
    let user = null,
      envelope = null,
      generation = 0,
      busy = false,
      conflict = null;
    const key = () => `waypoint.cloud.v1:${namespace}:${user.id}`;
    const status = (state, message) =>
      onStatus({ state, message, user, conflicts: conflict?.conflicts || [] });
    const persist = () => storage.setItem(key(), JSON.stringify(envelope));
    function setUser(next) {
      if (user?.id === next?.id) return;
      generation++;
      user = next;
      conflict = null;
      busy = false;
      envelope = null;
      if (user) {
        const raw = storage.getItem(key());
        if (raw) {
          const stored = JSON.parse(raw);
          if (
            !valid(stored.data) ||
            !valid(stored.base) ||
            !Number.isInteger(stored.revision)
          )
            throw Error(
              "This device's saved cloud copy is invalid. Contact support before clearing it.",
            );
          envelope = stored;
        } else
          envelope = {
            revision: 0,
            base: initial(),
            data: initial(),
            dirty: false,
          };
        onData(copy(envelope.data));
        status("pending", "Connecting to cloud…");
      } else status("signed-out", "Local only · Sign in to sync");
    }
    function change(data) {
      if (!user) return;
      if (!valid(data)) throw Error("Invalid task data");
      envelope.data = copy(data);
      envelope.dirty = true;
      persist();
      status(
        conflict ? "conflict" : "pending",
        conflict
          ? "Choose which conflicting edits to keep"
          : "Changes saved on this device · Waiting to sync",
      );
    }
    async function sync() {
      if (!user || busy || conflict) return;
      if (!online()) {
        status("offline", "Offline · Changes stay on this device");
        return;
      }
      busy = true;
      const run = generation,
        id = user.id;
      const active = () => generation === run;
      status("syncing", "Syncing…");
      try {
        for (let attempt = 0; attempt < 5; attempt++) {
          const { data: row, error } = await client
            .from("waypoint_documents")
            .select("revision,data")
            .eq("user_id", id)
            .maybeSingle()
            .abortSignal(AbortSignal.timeout(15000));
          if (!active()) return;
          if (error) throw error;
          if (row && !valid(row.data))
            throw Error("Cloud data is invalid; local changes have been kept.");
          const remote = row?.data || initial(),
            revision = row?.revision || 0;
          const merged = envelope.dirty
            ? merge(envelope.base, envelope.data, remote)
            : { data: remote, conflicts: [] };
          if (merged.conflicts.length) {
            conflict = { remote, revision, conflicts: merged.conflicts };
            status(
              "conflict",
              "Both devices edited the same item. Choose which edits to keep.",
            );
            return;
          }
          const changed = !equal(envelope.data, merged.data);
          envelope.base = copy(remote);
          envelope.revision = revision;
          envelope.data = copy(merged.data);
          envelope.dirty = !equal(remote, merged.data);
          persist();
          if (changed) onData(copy(envelope.data));
          if (!envelope.dirty) {
            status("saved", "Saved to cloud");
            return;
          }
          const sent = copy(envelope.data);
          const saved = await client
            .rpc("save_waypoint_document", {
              expected_revision: revision,
              document: sent,
            })
            .abortSignal(AbortSignal.timeout(15000));
          if (!active()) return;
          if (saved.error?.code === "40001") continue;
          if (saved.error) throw saved.error;
          // Edits made while the upload was in flight must remain queued.
          envelope.base = sent;
          envelope.revision = saved.data.revision;
          envelope.dirty = !equal(envelope.data, sent);
          persist();
          if (!envelope.dirty) {
            status("saved", "Saved to cloud");
            return;
          }
        }
        status("pending", "Another device is saving · Will retry");
      } catch (error) {
        if (active())
          status(
            "error",
            "Could not sync · Changes kept on this device. " +
              (error.message || "Try again."),
          );
      } finally {
        if (active()) busy = false;
      }
    }
    function resolve(prefer) {
      if (!conflict) return;
      const merged = merge(
        envelope.base,
        envelope.data,
        conflict.remote,
        prefer,
      );
      envelope.data = merged.data;
      envelope.base = copy(conflict.remote);
      envelope.revision = conflict.revision;
      envelope.dirty = !equal(envelope.data, envelope.base);
      conflict = null;
      persist();
      onData(copy(envelope.data));
      return sync();
    }
    return {
      setUser,
      change,
      sync,
      resolve,
      get pending() {
        return !!envelope?.dirty;
      },
    };
  }
  return { create, merge, equal, valid, identify };
})();
if (typeof module !== "undefined") module.exports = WaypointSync;
