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
  return { create, merge, equal, valid };
})();
if (typeof module !== "undefined") module.exports = WaypointSync;
