/* NEXUS Snap-on torque storage (localStorage) */

(function () {
  const STORAGE_KEY = "nexus.torque.sessions.v1";

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function loadAll() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeJsonParse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }

  function saveAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    // fallback
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function upsertSession(session) {
    const list = loadAll();
    list.push(session);
    saveAll(list);
    return session;
  }

  function listSessions(jobId, equipmentId) {
    const list = loadAll();
    return list
      .filter(s => s.jobId === jobId && s.equipmentId === equipmentId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  // expose
  window.NEXUS_SNAPON_STORE = {
    STORAGE_KEY,
    loadAll,
    upsertSession,
    listSessions,
    uuid,
  };
})();
