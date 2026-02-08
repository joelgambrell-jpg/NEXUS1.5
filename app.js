// app.js
// NEXUS Landing / Form page renderer
// - Uses window.FORMS from config.js
// - Builds buttons, handles embed pages, completion, role banner integration
// - GitHub Pages safe (relative links)
// NOTE: Patched to prevent duplicate "Megohmmeter SOP" when config.js already provides it.

(function(){
  "use strict";

  // ===== Helpers =====
  function qs(){
    return new URLSearchParams(window.location.search);
  }
  function getParam(name){
    return (qs().get(name) || "").trim();
  }
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function looksLikeUrl(v){
    return typeof v === "string" && /^https?:\/\//i.test((v||"").trim());
  }
  function safeHref(href){
    // allow absolute http(s), otherwise treat as relative
    href = (href || "").trim();
    if (!href) return "#";
    if (looksLikeUrl(href)) return href;

    // Keep within same origin relative path
    // IMPORTANT: do not auto-prepend leading slash (breaks project pages)
    return href.replace(/^\/*/, "");
  }

  function applyEqToHref(href, eq, rif){
    href = (href || "").trim();
    if (!href) return href;
    try{
      const u = new URL(href, window.location.href);
      if (u.origin !== window.location.origin) return href; // leave external links alone
      if (eq) u.searchParams.set("eq", eq);
      if (rif) u.searchParams.set("rif", rif);
      return u.pathname.replace(/^\//,"") + u.search + u.hash;
    }catch(e){
      return href;
    }
  }

  function setBg(img){
    if (!img) return;
    document.body.style.backgroundImage = 'url("' + img + '")';
  }

  function setTitle(t){
    var el = document.getElementById("page-title");
    if (el) el.textContent = t || "";
    document.title = t ? (t + " — NEXUS") : "NEXUS";
  }

  function setSectionTitle(t){
    var el = document.getElementById("section-title");
    if (el) el.textContent = t || "";
  }

  // ===== Completion storage (existing pattern) =====
  function completionKey(eq, formId){
    // keep legacy behavior compatible
    return "nexus_" + (eq || "NO_EQ") + "_step_" + formId;
  }
  function isComplete(eq, formId){
    try{ return localStorage.getItem(completionKey(eq, formId)) === "1"; }
    catch(e){ return false; }
  }

  // ===== Main render =====
  function render(){
    var id = getParam("id");
    var eq = getParam("eq");
    var rif = getParam("rif");

    if (!id){
      setTitle("Form");
      setSectionTitle("");
      return;
    }

    var cfg = (window.FORMS && window.FORMS[id]) ? window.FORMS[id] : null;
    if (!cfg){
      setTitle("Unknown Form");
      setSectionTitle("Unknown");
      return;
    }

    setBg(cfg.backgroundImage || "");
    setTitle(cfg.title || id);
    setSectionTitle(cfg.sectionTitle || "");

    // If this form is an embed-only page, app.js historically used #media.
    // In your current form.html, media is removed; we keep logic but no-op.
    if (cfg.embedUrl){
      // nothing to do here in current UI; user launches embeds from buttons elsewhere
    }

    // Build buttons
    var buttonsEl = document.getElementById("buttons");
    if (!buttonsEl) return;
    buttonsEl.innerHTML = "";

    var btnList = Array.isArray(cfg.buttons) ? cfg.buttons.slice() : [];

    // ---- PATCH: prevent duplicate SOP injection if config already provides it ----
    // MEG: SOP under Megohmmeter Test Log (matches styling)
    // Only inject if config.js did NOT already provide a SOP button (prevents duplicates).
    const MEG_IDS = new Set(["meg","megohmmeter_line","megohmmeter_load"]);
    if (MEG_IDS.has(id)) {
      const hasSop = btnList.some(x => String((x && x.text) || "").trim().toLowerCase() === "megohmmeter sop");
      if (!hasSop) {
        btnList.splice(1, 0, {
          text: "Megohmmeter SOP",
          href: "megohmmeter_sop.html",
          newTab: false
        });
      }
    }
    // ---------------------------------------------------------------------------

    btnList.forEach(function(b){
      if (!b || !b.text) return;

      var a = document.createElement("a");
      a.className = "btn";
      a.textContent = b.text;

      var href = safeHref(b.href || "#");
      href = applyEqToHref(href, eq, rif);
      a.setAttribute("href", href);

      // newTab behavior: only for external unless explicitly requested
      var isExternal = looksLikeUrl((b.href||"").trim());
      var openNew = !!b.newTab || isExternal;
      if (openNew){
        a.setAttribute("target","_blank");
        a.setAttribute("rel","noopener");
      }

      // completion state (existing pattern)
      if (isComplete(eq, id)){
        a.classList.add("complete");
      }

      buttonsEl.appendChild(a);
    });
  }

  // Some legacy elements existed in earlier versions; keep harmless.
  function hardHideLegacySopBtn(){
    try{
      var sop = document.getElementById("openSopBtn");
      if (sop) sop.style.display = "none";
    }catch(e){}
  }

  document.addEventListener("DOMContentLoaded", function(){
    hardHideLegacySopBtn();
    render();
  });

})();
