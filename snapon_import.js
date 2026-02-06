/* Snap-on ConnecTorq CSV import (client-side, iPad-friendly) */

(function () {
  const $ = (id) => document.getElementById(id);
  const statusEl = $("status");
  const parseBtn = $("parseBtn");
  const saveBtn = $("saveBtn");
  const fileEl = $("file");
  const previewBlock = $("previewBlock");
  const savedBlock = $("savedBlock");
  const previewTable = $("previewTable");
  const metaLine = $("metaLine");

  const pillEvents = $("pillEvents");
  const pillPass = $("pillPass");
  const pillFail = $("pillFail");
  const pillUnits = $("pillUnits");

  const jobIdEl = $("jobId");
  const equipmentIdEl = $("equipmentId");

  function setStatus(msg) { statusEl.textContent = msg || ""; }

  function qs(name) {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  }

  // Prefill from query params commonly used in NEXUS pages
  // Supports: ?jobId=...&equipmentId=... OR ?jobId=...&eq=...
  jobIdEl.value = qs("jobId") || "";
  equipmentIdEl.value = qs("equipmentId") || qs("eq") || "";

  let parsed = null; // { fileName, units, events[], summary }

  // --- CSV parsing helpers (no deps) ---
  function guessDelimiter(sampleLine) {
    const candidates = [",", ";", "\t", "|"];
    let best = ",";
    let bestCount = -1;
    for (const c of candidates) {
      const count = (sampleLine.match(new RegExp(`\\${c}`, "g")) || []).length;
      if (count > bestCount) { bestCount = count; best = c; }
    }
    return best;
  }

  function parseCsv(text) {
    // Basic CSV parser with quotes support
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim().length > 0);
    if (!lines.length) return { headers: [], rows: [] };

    const delimiter = guessDelimiter(lines[0]);

    const rows = [];
    for (const line of lines) {
      const out = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { // escaped quote
            cur += '"'; i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === delimiter && !inQuotes) {
          out.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      rows.push(out.map(s => s.trim()));
    }

    const headers = rows[0];
    const dataRows = rows.slice(1).filter(r => r.some(x => String(x).trim() !== ""));
    const objects = dataRows.map(r => {
      const obj = {};
      for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] ?? "";
      return obj;
    });

    return { headers, rows: objects };
  }

  function normHeader(h) {
    return String(h || "")
      .toLowerCase()
      .trim()
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const SYN = {
    timestamp: ["time", "timestamp", "date", "datetime", "recorded at"],
    actualTorque: ["actual torque", "torque", "measured torque", "result", "value"],
    targetTorque: ["target torque", "target", "setpoint", "spec", "nominal"],
    angle: ["angle", "degrees", "deg"],
    passFail: ["status", "pass/fail", "pass fail", "ok", "result status", "judgement", "judgment"],
    units: ["units", "unit"],
    toolSerial: ["tool serial", "serial", "tool id", "id"],
    toolModel: ["tool model", "model"],
  };

  function findKey(headers, wantedList) {
    const n = headers.map(h => ({ raw: h, n: normHeader(h) }));
    for (const wanted of wantedList) {
      const w = normHeader(wanted);
      const exact = n.find(x => x.n === w);
      if (exact) return exact.raw;
      const partial = n.find(x => x.n.includes(w));
      if (partial) return partial.raw;
    }
    return null;
  }

  function numLoose(x) {
    const s = String(x ?? "").replace(/,/g, "");
    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return undefined;
    const v = Number(m[0]);
    return Number.isFinite(v) ? v : undefined;
  }

  function pf(x) {
    const v = String(x ?? "").trim().toLowerCase();
    if (!v) return "UNKNOWN";
    if (["pass", "ok", "good", "true", "1", "p"].includes(v)) return "PASS";
    if (["fail", "ng", "bad", "false", "0", "f"].includes(v)) return "FAIL";
    return "UNKNOWN";
  }

  function renderPreview(events) {
    const cols = ["timestamp", "actualTorque", "targetTorque", "angle", "units", "passFail"];
    const head = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;
    const body = events.slice(0, 12).map(e =>
      `<tr>${cols.map(c => `<td>${e[c] ?? ""}</td>`).join("")}</tr>`
    ).join("");
    previewTable.innerHTML = head + body;
  }

  function renderSavedList(jobId, equipmentId) {
    const listEl = $("sessionList");
    const sessions = window.NEXUS_SNAPON_STORE.listSessions(jobId, equipmentId);

    if (!sessions.length) {
      listEl.innerHTML = `<div class="item"><div class="itemTitle">No sessions saved yet.</div></div>`;
      savedBlock.classList.remove("hidden");
      return;
    }

    listEl.innerHTML = sessions.map(s => {
      const title = `${s.source} • ${s.eventCount} events • ${s.passCount} pass / ${s.failCount} fail`;
      const sub = `${s.sourceFileName} • capturedAt ${s.capturedAt}`;
      return `
        <div class="item">
          <div class="itemTop">
            <div>
              <div class="itemTitle">${title}</div>
              <div class="itemSub">${sub}</div>
              <div class="mono">sessionId: ${s.id}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    savedBlock.classList.remove("hidden");
  }

  async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ""));
      r.onerror = () => reject(new Error("File read failed"));
      r.readAsText(file);
    });
  }

  parseBtn.addEventListener("click", async () => {
    setStatus("");
    previewBlock.classList.add("hidden");
    saveBtn.disabled = true;
    parsed = null;

    const jobId = jobIdEl.value.trim();
    const equipmentId = equipmentIdEl.value.trim();
    if (!jobId || !equipmentId) return setStatus("Job ID and Equipment ID are required.");

    const file = fileEl.files && fileEl.files[0];
    if (!file) return setStatus("Choose a CSV exported from ConnecTorq.");

    setStatus("Parsing…");

    try {
      const text = await readFileAsText(file);
      const { headers, rows } = parseCsv(text);
      if (!headers.length || !rows.length) return setStatus("CSV appears empty or unreadable.");

      const kTs = findKey(headers, SYN.timestamp);
      const kAct = findKey(headers, SYN.actualTorque);
      const kTgt = findKey(headers, SYN.targetTorque);
      const kAng = findKey(headers, SYN.angle);
      const kPF = findKey(headers, SYN.passFail);
      const kUnits = findKey(headers, SYN.units);
      const kSerial = findKey(headers, SYN.toolSerial);
      const kModel = findKey(headers, SYN.toolModel);

      const first = rows[0] || {};
      const units = (kUnits ? String(first[kUnits] || "").trim() : "") || undefined;
      const toolSerial = (kSerial ? String(first[kSerial] || "").trim() : "") || undefined;
      const toolModel = (kModel ? String(first[kModel] || "").trim() : "") || undefined;

      const events = rows.map(r => ({
        timestamp: kTs ? String(r[kTs] || "").trim() || undefined : undefined,
        actualTorque: kAct ? numLoose(r[kAct]) : undefined,
        targetTorque: kTgt ? numLoose(r[kTgt]) : undefined,
        angle: kAng ? numLoose(r[kAng]) : undefined,
        units: (kUnits ? String(r[kUnits] || "").trim() : "") || units,
        passFail: kPF ? pf(r[kPF]) : "UNKNOWN",
        raw: r
      }));

      const passCount = events.filter(e => e.passFail === "PASS").length;
      const failCount = events.filter(e => e.passFail === "FAIL").length;

      // capturedAt: first timestamp if parseable; else now
      let capturedAt = new Date().toISOString();
      const ts0 = events.find(e => e.timestamp)?.timestamp;
      if (ts0) {
        const d = new Date(ts0);
        if (!isNaN(d.getTime())) capturedAt = d.toISOString();
      }

      parsed = {
        fileName: file.name,
        units,
        toolSerial,
        toolModel,
        capturedAt,
        events,
        eventCount: events.length,
        passCount,
        failCount
      };

      pillEvents.textContent = `events: ${events.length}`;
      pillPass.textContent = `pass: ${passCount}`;
      pillFail.textContent = `fail: ${failCount}`;
      pillUnits.textContent = `units: ${units || "—"}`;

      metaLine.textContent =
        `${file.name} • ${toolModel ? toolModel + " • " : ""}${toolSerial ? toolSerial + " • " : ""}capturedAt ${capturedAt}`;

      renderPreview(events);
      previewBlock.classList.remove("hidden");
      saveBtn.disabled = false;
      setStatus("Preview ready. Save to store in NEXUS.");

      renderSavedList(jobId, equipmentId);
    } catch (e) {
      setStatus(`Parse failed: ${e.message || e}`);
    }
  });

  saveBtn.addEventListener("click", () => {
    const jobId = jobIdEl.value.trim();
    const equipmentId = equipmentIdEl.value.trim();
    if (!parsed) return setStatus("Nothing parsed yet.");

    const session = {
      id: window.NEXUS_SNAPON_STORE.uuid(),
      jobId,
      equipmentId,
      source: "SNAPON_CONNECTORQ",
      sourceFileName: parsed.fileName,
      capturedAt: parsed.capturedAt,
      toolSerial: parsed.toolSerial,
      toolModel: parsed.toolModel,
      units: parsed.units,
      eventCount: parsed.eventCount,
      passCount: parsed.passCount,
      failCount: parsed.failCount,
      createdAt: new Date().toISOString(),
      events: parsed.events, // stored for later export/reporting
    };

    window.NEXUS_SNAPON_STORE.upsertSession(session);
    setStatus("Saved to NEXUS (localStorage).");
    renderSavedList(jobId, equipmentId);
    saveBtn.disabled = true;
  });

  // Initial saved list, if job/equipment prefilled
  (function init() {
    const jobId = jobIdEl.value.trim();
    const equipmentId = equipmentIdEl.value.trim();
    if (jobId && equipmentId) renderSavedList(jobId, equipmentId);
  })();
})();
