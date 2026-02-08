/* app.js (FULL drop-in) */
(function () {
  const params = new URLSearchParams(location.search);
  const id = (params.get("id") || "").trim();
  const eq = (params.get("eq") || "").trim();

  function loadEqMeta(){
    if (!eq) return null;
    const primaryKey = `nexus_meta_${eq}`;
    const legacyKey = "nexus_meta_";
    try{
      const raw = localStorage.getItem(primaryKey);
      if (raw) return JSON.parse(raw);
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw) return JSON.parse(legacyRaw);
    }catch(e){}
    return null;
  }

  // Require FORMS + valid ID
  if (!id || !window.FORMS || !window.FORMS[id]) {
    document.body.innerHTML =
      '<div style="background:#b60000;color:white;padding:40px;font-family:Arial">' +
      "<h2>Invalid or missing form ID</h2>" +
      "<p>Example: <code>form.html?id=rif</code></p>" +
      "</div>";
    return;
  }

  const cfg = window.FORMS[id];

  document.title = cfg.title || "Form";
  const pageTitle = document.getElementById("page-title");
  const sectionTitle = document.getElementById("section-title");
  if (pageTitle) pageTitle.textContent = cfg.title || "";
  if (sectionTitle) sectionTitle.textContent = cfg.sectionTitle || "";

  const eqLabel = document.getElementById("eqLabel");
  if (eqLabel) eqLabel.textContent = eq ? `Equipment: ${eq}` : "";

  if (cfg.backgroundImage) {
    document.body.style.backgroundImage = `url("${cfg.backgroundImage}")`;
  }

  const buttonsWrap = document.getElementById("buttonsWrap");
  const buttonsEl = document.getElementById("buttons");
  const mediaEl = document.getElementById("media");

  // Storage keys used by equipment.html
  function stepKey(stepId){ return `nexus_${eq || "NO_EQ"}_step_${stepId}`; }
  function landingKey(){ return `nexus_${eq || "NO_EQ"}_landing_complete`; }

  // =========================
  // Firebase sync (optional)
  // =========================
  async function fbSetStep(eqId, stepId, isDone){
    try{
      if (!window.NEXUS_FB?.db || !eqId || !stepId) return;
      const { db, auth } = window.NEXUS_FB;

      const { doc, setDoc, serverTimestamp } =
        await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

      const ref = doc(db, "equipment", eqId, "steps", stepId);
      await setDoc(ref, {
        done: !!isDone,
        updatedAt: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || null
      }, { merge:true });
    }catch(e){
      console.warn("Firebase step sync failed:", e);
    }
  }

  let fbUnsub = null;
  async function fbListenStep(eqId, stepId){
    try{
      if (!window.NEXUS_FB?.db || !eqId || !stepId) return;
      const { db } = window.NEXUS_FB;

      const { doc, onSnapshot } =
        await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

      const ref = doc(db, "equipment", eqId, "steps", stepId);

      fbUnsub = onSnapshot(ref, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() || {};
        if (data.done) localStorage.setItem(stepKey(stepId), "1");
        else localStorage.removeItem(stepKey(stepId));
        refreshStepBtn();
      });
    }catch(e){
      console.warn("Firebase listener failed:", e);
    }
  }

  // =========================
  // Step Complete button (ALL TASKS)
  // =========================
  const stepBtn = document.getElementById("stepCompleteBtn");

  // pages that should never be completable
  const NON_COMPLETABLE = new Set(["construction","phenolic","transformer","supporting","megger_reporting"]);
  const hideToggle = NON_COMPLETABLE.has(id);

  // Hide immediately (prevents flash)
  if (stepBtn) stepBtn.style.display = "none";

  function usable(){ return !!(eq && id); }
  function done(){ return !!(eq && id && localStorage.getItem(stepKey(id)) === "1"); }

  async function setDoneState(nextDone){
    if (!usable()) return;

    if (cfg.completedKey){
      if (nextDone) localStorage.setItem(cfg.completedKey, "true");
      else localStorage.removeItem(cfg.completedKey);
    }

    if (nextDone){
      localStorage.setItem(stepKey(id), "1");
      localStorage.setItem(landingKey(), "1");
    } else {
      localStorage.removeItem(stepKey(id));
    }

    await fbSetStep(eq, id, nextDone);
  }

  function refreshStepBtn(){
    if (!stepBtn) return;

    if (hideToggle){
      stepBtn.style.display = "none";
      return;
    }

    // Show on ALL task pages
    stepBtn.style.display = "block";
    stepBtn.disabled = !usable();
    stepBtn.title = usable() ? "" : "Missing eq or id in URL";

    const isDone = done();
    stepBtn.classList.toggle("complete", isDone);
    stepBtn.textContent = isDone ? "Step Complete ✓" : "Mark Step Complete";
  }

  if (stepBtn){
    stepBtn.addEventListener("click", async () => {
      if (!usable()) return;
      const next = !done();
      await setDoneState(next);
      refreshStepBtn();
    });
  }

  // keep in sync
  refreshStepBtn();
  window.addEventListener("storage", refreshStepBtn);
  window.addEventListener("focus", refreshStepBtn);
  window.addEventListener("pageshow", refreshStepBtn);

  if (usable() && !hideToggle) fbListenStep(eq, id);

  window.addEventListener("beforeunload", () => {
    try{ if (fbUnsub) fbUnsub(); }catch(e){}
  });

  function withEq(href) {
    if (!eq || !href) return href;
    if (/^https?:\/\//i.test(href)) return href;

    const u = new URL(href, location.href);
    if (u.origin !== location.origin) return href;

    u.searchParams.set("eq", eq);

    if (u.pathname.endsWith("/submit.html") || u.pathname.endsWith("submit.html")) {
      if (!u.searchParams.get("form") && !u.searchParams.get("id")) {
        u.searchParams.set("form", id);
      }
    }

    return u.pathname + u.search + u.hash;
  }

  // =========================
  // IMPORTANT: Kill the legacy SOP button entirely.
  // We render SOP as a normal .btn entry so it matches styling.
  // =========================
  (function hardHideLegacySopBtn(){
    const sopBtn = document.getElementById("openSopBtn");
    if (!sopBtn) return;
    sopBtn.style.display = "none";
    sopBtn.onclick = null;
  })();

  // EMBED MODE
  if (cfg.embedUrl) {
    if (buttonsWrap) buttonsWrap.style.display = "none";
    if (mediaEl){
      mediaEl.style.display = "block";
      mediaEl.innerHTML = `<iframe class="embed" src="${withEq(cfg.embedUrl)}" title="${cfg.title || ""}"></iframe>`;
    }
    return;
  }

  // IMAGE MODE
  if (cfg.imageUrl) {
    if (buttonsWrap) buttonsWrap.style.display = "none";
    if (mediaEl){
      mediaEl.style.display = "block";
      mediaEl.innerHTML = `
        <img id="mainImg" src="${cfg.imageUrl}" alt="${cfg.title || "Image"}" style="max-width:100%;border-radius:18px;cursor:zoom-in;">
        <div style="margin-top:12px;">
          <a class="btn" href="${cfg.imageUrl}" target="_blank" rel="noopener noreferrer">Open Image in New Tab</a>
        </div>
      `;
    }
    return;
  }

  // BUTTON MODE
  if (buttonsWrap) buttonsWrap.style.display = "inline-block";
  if (mediaEl) mediaEl.style.display = "none";
  if (buttonsEl) buttonsEl.innerHTML = "";

  const btnList = Array.isArray(cfg.buttons) ? [...cfg.buttons] : [];

  // Helpers to prevent duplicates
  const norm = (s) => String(s || "").toLowerCase().trim();
  function hasButton(matchFn){
    return btnList.some((b) => matchFn(b || {}));
  }

  // TORQUE: SOP under Torque Application Log (ONLY if not already present)
  if (id === "torque") {
    const alreadyHasTorqueSop = hasButton((b) => {
      const t = norm(b.text);
      const h = String(b.href || "");
      return t === "torque sop" || /torque_sop\.html/i.test(h);
    });

    if (!alreadyHasTorqueSop) {
      btnList.splice(1, 0, {
        text: "Torque SOP",
        href: "torque_sop.html",
        newTab: true
      });
    }
  }

  // MEG: SOP under Megohmmeter Test Log (ONLY if not already present)
  const MEG_IDS = new Set(["meg","megohmmeter_line","megohmmeter_load"]);
  if (MEG_IDS.has(id)) {
    const alreadyHasMegSop = hasButton((b) => {
      const t = norm(b.text);
      const h = String(b.href || "");
      return t === "megohmmeter sop" || /megohmmeter_sop\.html/i.test(h);
    });

    if (!alreadyHasMegSop) {
      btnList.splice(1, 0, {
        text: "Megohmmeter SOP",
        href: "megohmmeter_sop.html",
        newTab: false
      });
    }
  }

  btnList.forEach((b) => {
    const a = document.createElement("a");
    a.className = "btn";
    a.textContent = b.text || "Open";
    a.href = withEq(b.href || "#");

    if (b.newTab || /^https?:\/\//i.test(a.href)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }

    buttonsEl.appendChild(a);
  });

  refreshStepBtn();
})();
