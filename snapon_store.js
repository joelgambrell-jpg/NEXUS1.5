/* NEXUS Snap-on torque storage (localStorage + best-effort Firebase backup) */

(function () {
  const STORAGE_KEY = "nexus.torque.sessions.v1";
  const REMOTE_COLLECTION = "snapon_torque_sessions";

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function loadAll() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeJsonParse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }

  function saveAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
  }

  function uuid() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (e) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function normalizeSession(session) {
    const s = Object.assign({}, session || {});
    if (!s.id) s.id = uuid();
    if (!s.source) s.source = "SNAPON_CONNECTORQ";
    if (!s.createdAt) s.createdAt = new Date().toISOString();
    if (!Array.isArray(s.events)) s.events = [];
    if (typeof s.eventCount !== "number") s.eventCount = s.events.length;
    if (typeof s.passCount !== "number") {
      s.passCount = s.events.filter(function (e) { return e && e.passFail === "PASS"; }).length;
    }
    if (typeof s.failCount !== "number") {
      s.failCount = s.events.filter(function (e) { return e && e.passFail === "FAIL"; }).length;
    }
    return s;
  }

  function dedupeAndSort(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach(function (item) {
      if (!item || typeof item !== "object") return;
      const s = normalizeSession(item);
      map.set(String(s.id), s);
    });

    return Array.from(map.values()).sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  }

  function mergeIntoLocal(session) {
    const incoming = normalizeSession(session);
    const list = loadAll();
    const idx = list.findIndex(function (s) {
      return s && String(s.id) === String(incoming.id);
    });

    if (idx >= 0) {
      list[idx] = incoming;
    } else {
      list.push(incoming);
    }

    const merged = dedupeAndSort(list);
    saveAll(merged);
    return incoming;
  }

  function listSessions(jobId, equipmentId) {
    const list = loadAll();
    return list
      .filter(function (s) {
        return s && s.jobId === jobId && s.equipmentId === equipmentId;
      })
      .sort(function (a, b) {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }

  function getBridge() {
    return (
      window.NEXUS_FIREBASE_BRIDGE ||
      window.NEXUS_FIREBASE ||
      window.NEXUS_FB ||
      window.FirebaseBridge ||
      null
    );
  }

  async function tryFirebaseWrite(session) {
    const bridge = getBridge();
    if (!bridge) return { ok: false, reason: "no_bridge" };

    const s = normalizeSession(session);

    try {
      if (typeof bridge.saveDoc === "function") {
        await bridge.saveDoc(`nexus/snapon/${s.equipmentId || "NO_EQ"}/sessions/${s.id}`, s);
        return { ok: true, mode: "saveDoc" };
      }

      if (typeof bridge.setDoc === "function") {
        await bridge.setDoc(`nexus/snapon/${s.equipmentId || "NO_EQ"}/sessions/${s.id}`, s);
        return { ok: true, mode: "setDoc" };
      }

      if (typeof bridge.write === "function") {
        await bridge.write(`nexus/snapon/${s.equipmentId || "NO_EQ"}/sessions/${s.id}`, s);
        return { ok: true, mode: "write" };
      }

      if (typeof bridge.put === "function") {
        await bridge.put(`nexus/snapon/${s.equipmentId || "NO_EQ"}/sessions/${s.id}`, s);
        return { ok: true, mode: "put" };
      }

      if (typeof bridge.saveJSON === "function") {
        await bridge.saveJSON(`nexus/snapon/${s.equipmentId || "NO_EQ"}/sessions/${s.id}`, s);
        return { ok: true, mode: "saveJSON" };
      }

      if (typeof bridge.collectionUpsert === "function") {
        await bridge.collectionUpsert(REMOTE_COLLECTION, s.id, s);
        return { ok: true, mode: "collectionUpsert" };
      }

      if (typeof bridge.upsert === "function") {
        await bridge.upsert(REMOTE_COLLECTION, s.id, s);
        return { ok: true, mode: "upsert" };
      }

      return { ok: false, reason: "no_supported_write_method" };
    } catch (err) {
      return {
        ok: false,
        reason: "write_failed",
        error: err && err.message ? err.message : String(err)
      };
    }
  }

  async function tryFirebaseReadByEquipment(jobId, equipmentId) {
    const bridge = getBridge();
    if (!bridge) return [];

    try {
      if (typeof bridge.listDocs === "function") {
        const out = await bridge.listDocs(`nexus/snapon/${equipmentId || "NO_EQ"}/sessions`);
        return Array.isArray(out) ? out : [];
      }

      if (typeof bridge.queryCollection === "function") {
        const out = await bridge.queryCollection(REMOTE_COLLECTION, {
          jobId: jobId,
          equipmentId: equipmentId
        });
        return Array.isArray(out) ? out : [];
      }

      if (typeof bridge.list === "function") {
        const out = await bridge.list(`nexus/snapon/${equipmentId || "NO_EQ"}/sessions`);
        return Array.isArray(out) ? out : [];
      }
    } catch (err) {
      console.warn("NEXUS Snap-on Firebase read failed:", err);
    }

    return [];
  }

  async function upsertSession(session) {
    const saved = mergeIntoLocal(session);

    const fb = await tryFirebaseWrite(saved);
    if (fb.ok) {
      try {
        console.log("NEXUS Snap-on Firebase backup OK:", fb.mode, saved.id);
      } catch (e) {}
    } else {
      try {
        console.warn("NEXUS Snap-on Firebase backup skipped/failed:", fb.reason || "unknown");
      } catch (e) {}
    }

    return saved;
  }

  async function restoreSessions(jobId, equipmentId) {
    const remote = await tryFirebaseReadByEquipment(jobId, equipmentId);
    if (!Array.isArray(remote) || !remote.length) {
      return listSessions(jobId, equipmentId);
    }

    remote.forEach(function (s) {
      mergeIntoLocal(s);
    });

    return listSessions(jobId, equipmentId);
  }

  function clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  }

  window.NEXUS_SNAPON_STORE = {
    STORAGE_KEY,
    REMOTE_COLLECTION,
    loadAll,
    saveAll,
    upsertSession,
    listSessions,
    restoreSessions,
    clearAll,
    uuid
  };
})();
