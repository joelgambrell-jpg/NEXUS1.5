/* app.js (FULL drop-in) */
(function () {
  const params = new URLSearchParams(location.search);
  const id = (params.get("id") || "").trim();
  const eq = (params.get("eq") || "").trim();

  function loadEqMeta() {
    if (!eq) return null;
    const primaryKey = `nexus_meta_${eq}`;
    const legacyKey = "nexus_meta_";
    try {
      const raw = localStorage.getItem(primaryKey);
      if (raw) return JSON.parse(raw);
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw) {
        const obj = JSON.parse(legacyRaw);
        if (obj && obj.eq === eq) return obj;
      }
    } catch (e) {}
    return null;
  }

  function setTopPills() {
    const eqPill = document.getElementById("nexusPillEquipment");
    const rolePill = document.getElementById("nexusPillRole");
    const statusPill = document.getElementById("nexusPillStatus");

    if (eqPill) {
      eqPill.textContent = `Equipment: ${eq || "(none)"}`;
    }

    const role = (localStorage.getItem("nexus_role") || "viewer").trim();
    if (rolePill) rolePill.textContent = `Role: ${role || "viewer"}`;

    if (statusPill) statusPill.textContent = "Ready";
  }

  function setHeroEquipmentLine() {
    const heroEq = document.getElementById("nexusHeroEquipmentLine");
    if (!heroEq) return;
    heroEq.textContent = `Equipment: ${eq || "(none)"}`;
  }

  function setEquipmentImage() {
    const img = document.getElementById("nexusEquipImageDisplay");
    const container = document.getElementById("nexusEquipImageContainer");
    if (!img || !container) return;

    const meta = loadEqMeta();
    const url = meta && meta.imageUrl ? String(meta.imageUrl) : "";
    if (url) {
      img.src = url;
      container.style.display = "";
    } else {
      container.style.display = "none";
    }
  }

  function withEq(href) {
    if (!href) return href;
    try {
      const u = new URL(href, location.href);
      if (eq) u.searchParams.set("eq", eq);
      return u.pathname.split("/").pop() + (u.search ? u.search : "");
    } catch (e) {
      // fallback for simple relative hrefs
      if (!eq) return href;
      if (href.includes("?")) {
        if (/[?&]eq=/.test(href)) return href;
        return href + "&eq=" + encodeURIComponent(eq);
      }
      return href + "?eq=" + encodeURIComponent(eq);
    }
  }

  function showOrHideFallbackButtons(cfg) {
    // Fallback buttons exist in form.html but are hidden by default
    // Only show them if config/app didn't build the equivalent buttons.
    const sopBtn = document.getElementById("openSopBtn");
    const rifNoProcoreBtn = document.getElementById("rifNoProcoreBtn");
    const snaponBtn = document.getElementById("snaponImportBtn");
    const stepCompleteBtn = document.getElementById("stepCompleteBtn");

    if (stepCompleteBtn) stepCompleteBtn.style.display = "none";
    if (rifNoProcoreBtn) rifNoProcoreBtn.style.display = "none";
    if (snaponBtn) snaponBtn.style.display = "none";
    if (sopBtn) sopBtn.style.display = "none";

    // NOTE: We intentionally do NOT force-show fallback SOP here.
    // The dynamic button list drives SOP now, and duplicates are prevented below.
  }

  function getConfigForId() {
    // config.js is expected to define window.NEXUS_FORMS or window.FORMS or similar.
    const forms = window.NEXUS_FORMS || window.FORMS || window.forms || null;
    if (!forms || !id) return null;

    // forms may be an object keyed by id
    if (forms[id]) return forms[id];

    // or an array with {id: "..."}
    if (Array.isArray(forms)) {
      const found = forms.find((f) => f && String(f.id || "").trim() === id);
      if (found) return found;
    }

    return null;
  }

  function setFormHeader(cfg) {
    const titleEl = document.getElementById("nexusFormTitle");
    const subEl = document.getElementById("nexusFormSubtitle");
    if (titleEl) titleEl.textContent = cfg && cfg.title ? cfg.title : "Form";
    if (subEl) subEl.textContent = cfg && cfg.subtitle ? cfg.subtitle : "";
  }

  function setMedia(cfg) {
    const mediaEl = document.getElementById("nexusFormMedia");
    if (!mediaEl) return;

    const media = cfg && cfg.media ? cfg.media : null;
    if (!media || !media.src) {
      mediaEl.style.display = "none";
      return;
    }

    mediaEl.style.display = "";
    mediaEl.src = media.src;
  }

  function buildButtons(cfg) {
    const buttonsEl = document.getElementById("nexusFormButtons");
    const mediaEl = document.getElementById("nexusFormMedia");

    if (mediaEl) mediaEl.style.display = "none";
    if (buttonsEl) buttonsEl.innerHTML = "";

    const btnList = Array.isArray(cfg.buttons) ? [...cfg.buttons] : [];

    // TORQUE: SOP under Torque Application Log (only if not already present)
    const norm = (s) => String(s || "").toLowerCase().trim();
    const hasBtn = (predicate) => btnList.some((b) => predicate(b || {}));

    if (id === "torque") {
      const alreadyHasTorqueSop = hasBtn((b) => {
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

    // MEG: SOP under Megohmmeter Test Log (only if not already present)
    const MEG_IDS = new Set(["meg", "megohmmeter_line", "megohmmeter_load"]);
    if (MEG_IDS.has(id)) {
      const alreadyHasMegSop = hasBtn((b) => {
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
      a.className = "nexusBigButton";
      a.textContent = b.text || "Open";
      a.href = withEq(b.href || "#");

      if (b.newTab) {
        a.target = "_blank";
        a.rel = "noopener";
      }

      buttonsEl.appendChild(a);
    });
  }

  function init() {
    setTopPills();
    setHeroEquipmentLine();
    setEquipmentImage();

    const cfg = getConfigForId();
    if (!cfg) {
      // still set fallback UI and keep page stable
      showOrHideFallbackButtons({});
      return;
    }

    setFormHeader(cfg);
    setMedia(cfg);
    showOrHideFallbackButtons(cfg);
    buildButtons(cfg);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
