/* NEXUS core helpers (HTML-only). Safe defaults; no-op unless pages opt-in. */
(function(){
  const ROLE_ORDER = ["viewer","tech","foreman","superintendent","admin"];
  function roleIndex(r){ return Math.max(0, ROLE_ORDER.indexOf((r||"viewer").toLowerCase())); }

  window.NEXUS = window.NEXUS || {};
  window.NEXUS.getEq = function(){
    const qs = new URLSearchParams(location.search);
    return (qs.get("eq") || "").trim();
  };
  window.NEXUS.getRole = function(){
    try{
      return (localStorage.getItem("nexus_userRole") || "viewer").toLowerCase();
    }catch(e){ return "viewer"; }
  };
  window.NEXUS.roleAtLeast = function(minRole){
    return roleIndex(window.NEXUS.getRole()) >= roleIndex(minRole);
  };
  window.NEXUS.setRole = function(r){
    try{ localStorage.setItem("nexus_userRole",(r||"viewer").toLowerCase()); }catch(e){}
    window.dispatchEvent(new CustomEvent("nexus:rolechange",{detail:{role:window.NEXUS.getRole()}}));
  };

  window.NEXUS.audit = function(type, payload){
    try{
      const eq = window.NEXUS.getEq() || "NO_EQ";
      const key = `nexus_audit_${eq}`;
      const arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push({ type, payload: payload || {}, at: new Date().toISOString(), page: location.pathname.split("/").pop() });
      localStorage.setItem(key, JSON.stringify(arr));
    }catch(e){}
  };

  // Dirty/autosave (only if page sets window.NEXUS_saveNow = function() Promise|void )
  let dirty = false;
  let lastSavedAt = null;

  window.NEXUS.markDirty = function(){
    dirty = true;
    window.dispatchEvent(new CustomEvent("nexus:dirty",{detail:{dirty:true}}));
  };
  window.NEXUS.markSaved = function(){
    dirty = false;
    lastSavedAt = new Date();
    window.dispatchEvent(new CustomEvent("nexus:saved",{detail:{dirty:false, lastSavedAt:lastSavedAt.toISOString()}}));
  };

  function fmtTime(d){
    try{ return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }catch(e){ return ""; }
  }

  function updateBanner(){
    const el = document.getElementById("nxSessionBanner");
    if(!el) return;
    const eq = window.NEXUS.getEq();
    const role = window.NEXUS.getRole();
    const roleEl = el.querySelector("[data-nx-role]");
    const eqEl = el.querySelector("[data-nx-eq]");
    const stEl = el.querySelector("[data-nx-status]");
    if(eqEl) eqEl.textContent = eq || "(none)";
    if(roleEl) roleEl.textContent = role;
    if(stEl){
      if(dirty) stEl.textContent = "Unsaved changes";
      else if(lastSavedAt) stEl.textContent = "Saved locally at " + fmtTime(lastSavedAt);
      else stEl.textContent = "Ready";
    }

    // role gating via data-min-role
    document.querySelectorAll("[data-min-role]").forEach(node=>{
      const need = (node.getAttribute("data-min-role")||"viewer").toLowerCase();
      const ok = window.NEXUS.roleAtLeast(need);
      if(node.hasAttribute("data-min-role-hide")){
        node.style.display = ok ? "" : "none";
      }else{
        node.disabled = !ok;
        node.setAttribute("aria-disabled", (!ok).toString());
        node.style.opacity = ok ? "" : "0.5";
        node.style.pointerEvents = ok ? "" : "none";
      }
    });
  }

  window.addEventListener("nexus:dirty", updateBanner);
  window.addEventListener("nexus:saved", updateBanner);
  window.addEventListener("nexus:rolechange", updateBanner);

  document.addEventListener("input", function(e){
    const t = e.target;
    if(!t) return;
    if(t.matches("input,select,textarea,[contenteditable='true']")){
      window.NEXUS.markDirty();
    }
  }, true);

  // Autosave: every 15s if dirty and save hook exists.
  setInterval(async function(){
    if(!dirty) return;
    if(typeof window.NEXUS_saveNow !== "function") return;
    try{
      await window.NEXUS_saveNow({ autosave:true });
      window.NEXUS.markSaved();
    }catch(e){
      // keep dirty
    }
  }, 15000);

  // Back routing helper (consistent across pages)
  // Behavior:
  // - If referrer is same-origin, use history.back()
  // - Else go to equipment.html (preserving ?eq=) and fall back to index.html
  window.NEXUS.equipmentUrl = function(){
    const qs = new URLSearchParams(location.search);
    const eq = (qs.get("eq") || "").trim();
    return eq ? `equipment.html?eq=${encodeURIComponent(eq)}` : "equipment.html";
  };
  window.NEXUS_back = function(){
    try{
      if (document.referrer){
        const ref = new URL(document.referrer);
        if (ref.origin === location.origin){
          history.back();
          return false;
        }
      }
    }catch(e){}
    try{
      location.href = window.NEXUS.equipmentUrl();
    }catch(e){
      location.href = "index.html";
    }
    return false;
  };

  /* =====================================================================================
     HYBRID (C) STEP COMPLETION MODEL (opt-in)
     COMPLETE = (toggle === true) AND (valid === true)

     Storage keys per step:
       nexus_${eq}_${step}_toggle   -> "true"|"false"
       nexus_${eq}_${step}_valid    -> "true"|"false"
       nexus_${eq}_${step}_complete -> "true"|"false"  (derived; never set directly by UI)

     Legacy compatibility:
       Some pages use: nexus_${eq}_step_${legacyId} === "1"
       This helper can optionally mirror derived completion to that legacy key.
     ===================================================================================== */

  function _eqOrNoEq(){ return (window.NEXUS.getEq() || "NO_EQ"); }

  function _normStep(step){
    return String(step||"").trim().replace(/\s+/g,"_").toLowerCase();
  }

  function _boolToStr(b){ return b ? "true" : "false"; }

  function _parseBool(raw){
    if(raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if(s === "true" || s === "1" || s === "yes" || s === "y" || s === "on") return true;
    if(s === "false" || s === "0" || s === "no" || s === "n" || s === "off") return false;
    return null;
  }

  function _stepKey(step, kind){
    // kind: toggle|valid|complete
    const eq = _eqOrNoEq();
    return `nexus_${eq}_${_normStep(step)}_${kind}`;
  }

  function _legacyStepKey(legacyId){
    const eq = _eqOrNoEq();
    return `nexus_${eq}_step_${String(legacyId||"").trim()}`;
  }

  function _readStepKind(step, kind){
    try{
      return _parseBool(localStorage.getItem(_stepKey(step, kind)));
    }catch(e){ return null; }
  }

  function _writeStepKind(step, kind, val){
    try{
      localStorage.setItem(_stepKey(step, kind), _boolToStr(!!val));
      return true;
    }catch(e){ return false; }
  }

  function _clearStepKind(step, kind){
    try{
      localStorage.removeItem(_stepKey(step, kind));
      return true;
    }catch(e){ return false; }
  }

  function _emitStepEvent(step, payload){
    try{
      window.dispatchEvent(new CustomEvent("nexus:stepchange", { detail: Object.assign({ step:_normStep(step), eq:_eqOrNoEq() }, payload || {}) }));
    }catch(e){}
  }

  function _applyStepUI(step){
    // Optional, non-breaking:
    // Any element with:
    //   data-nx-step-button="torque" (or matching step)
    // gets:
    //   class "complete" when derived complete is true
    //   aria-pressed set
    const s = _normStep(step);
    let complete = null;
    try{ complete = window.NEXUS.getStepState(s).complete; }catch(e){ complete = null; }
    if(complete == null) return;

    document.querySelectorAll(`[data-nx-step-button]`).forEach(el=>{
      try{
        const target = _normStep(el.getAttribute("data-nx-step-button") || "");
        if(target !== s) return;
        if(complete){
          el.classList.add("complete");
          el.setAttribute("aria-pressed","true");
        }else{
          el.classList.remove("complete");
          el.setAttribute("aria-pressed","false");
        }
      }catch(e){}
    });
  }

  window.NEXUS.getStepState = function(step){
    const s = _normStep(step);
    const t = _readStepKind(s, "toggle");
    const v = _readStepKind(s, "valid");
    const cRaw = _readStepKind(s, "complete");
    const hasAny =
      (function(){
        try{
          return localStorage.getItem(_stepKey(s,"toggle")) != null ||
                 localStorage.getItem(_stepKey(s,"valid")) != null  ||
                 localStorage.getItem(_stepKey(s,"complete")) != null;
        }catch(e){ return false; }
      })();

    // Prefer stored derived complete if it exists; else derive if hybrid keys exist.
    const c = (cRaw !== null) ? cRaw : (hasAny ? (t === true && v === true) : null);

    return {
      step: s,
      eq: _eqOrNoEq(),
      enabled: !!hasAny,
      toggle: t,
      valid: v,
      complete: c
    };
  };

  window.NEXUS.recalcStepComplete = function(step, opts){
    const s = _normStep(step);
    const o = opts || {};
    const st = window.NEXUS.getStepState(s);

    // If not enabled and caller didn't request force, do nothing.
    if(!st.enabled && !o.force) return st;

    const toggle = (st.toggle === true);
    const valid  = (st.valid === true);
    const complete = (toggle && valid);

    // Write derived complete.
    _writeStepKind(s, "complete", complete);

    // Optional legacy mirroring
    // - If opts.legacyId is provided, mirror to nexus_${eq}_step_${legacyId} = "1" when complete else remove.
    // - If opts.mirrorLegacy === true and no legacyId provided, mirror to nexus_${eq}_step_${step} if step is a legacy id.
    try{
      const legacyId = (o.legacyId != null && String(o.legacyId).trim() !== "") ? String(o.legacyId).trim() : null;
      const mirrorLegacy = !!o.mirrorLegacy;

      if(legacyId){
        const k = _legacyStepKey(legacyId);
        if(complete) localStorage.setItem(k, "1");
        else localStorage.removeItem(k);
      }else if(mirrorLegacy){
        const k2 = _legacyStepKey(s);
        if(complete) localStorage.setItem(k2, "1");
        else localStorage.removeItem(k2);
      }
    }catch(e){}

    _emitStepEvent(s, { toggle:st.toggle, valid:st.valid, complete:complete });
    _applyStepUI(s);
    return window.NEXUS.getStepState(s);
  };

  window.NEXUS.setStepToggle = function(step, on, opts){
    const s = _normStep(step);
    _writeStepKind(s, "toggle", !!on);
    // Do not set complete directly; recalc.
    return window.NEXUS.recalcStepComplete(s, opts);
  };

  window.NEXUS.setStepValid = function(step, ok, opts){
    const s = _normStep(step);
    _writeStepKind(s, "valid", !!ok);
    // Do not set complete directly; recalc.
    return window.NEXUS.recalcStepComplete(s, opts);
  };

  window.NEXUS.clearStep = function(step, opts){
    const s = _normStep(step);
    _writeStepKind(s, "toggle", false);
    _writeStepKind(s, "valid", false);
    _writeStepKind(s, "complete", false);

    // Optional legacy mirroring (clear)
    try{
      const o = opts || {};
      const legacyId = (o.legacyId != null && String(o.legacyId).trim() !== "") ? String(o.legacyId).trim() : null;
      const mirrorLegacy = !!o.mirrorLegacy;
      if(legacyId){
        localStorage.removeItem(_legacyStepKey(legacyId));
      }else if(mirrorLegacy){
        localStorage.removeItem(_legacyStepKey(s));
      }
    }catch(e){}

    _emitStepEvent(s, { cleared:true, toggle:false, valid:false, complete:false });
    _applyStepUI(s);
    return window.NEXUS.getStepState(s);
  };

  // Optional helper to wire a "Step Complete" button with Hybrid behavior.
  // Usage (opt-in on a page):
  //   <button id="stepCompleteBtn" data-nx-step-complete="torque">Step Complete</button>
  //
  // Page must provide validator:
  //   window.NEXUS_validateStep = function(step){ return { valid:true|false, message?:string }; }
  //
  // When clicked:
  //   - If turning ON: runs validator, only allows ON when valid===true
  //   - If turning OFF: always allows OFF
  //
  // Supports legacy mirroring via data-nx-legacy-id="torque" or custom id.
  window.NEXUS.bindStepCompleteButtons = function(){
    document.querySelectorAll("[data-nx-step-complete]").forEach(btn=>{
      try{
        if(btn.__nexusBound) return;
        btn.__nexusBound = true;

        const step = _normStep(btn.getAttribute("data-nx-step-complete") || "");
        const legacyId = (btn.getAttribute("data-nx-legacy-id") || "").trim() || null;

        function refresh(){
          const st = window.NEXUS.getStepState(step);
          const on = (st.toggle === true);
          const ok = (st.valid === true);
          const complete = (st.complete === true);
          // Visual conventions are page-specific; we just add attributes/classes safely.
          btn.setAttribute("aria-pressed", on ? "true" : "false");
          btn.classList.toggle("is-on", on);
          btn.classList.toggle("is-valid", ok);
          btn.classList.toggle("complete", complete);
        }

        btn.addEventListener("click", function(){
          const st = window.NEXUS.getStepState(step);
          const currentlyOn = (st.toggle === true);
          const nextOn = !currentlyOn;

          // Turning OFF is always allowed.
          if(!nextOn){
            window.NEXUS.setStepToggle(step, false, { legacyId: legacyId, mirrorLegacy: !legacyId });
            refresh();
            return;
          }

          // Turning ON requires validation.
          let result = null;
          try{
            if(typeof window.NEXUS_validateStep === "function"){
              result = window.NEXUS_validateStep(step);
            }else if(typeof window.NEXUS_validateNow === "function"){
              // alternate hook some pages may use
              result = window.NEXUS_validateNow(step);
            }
          }catch(e){ result = { valid:false, message:"Validation error." }; }

          const valid = !!(result && typeof result === "object" ? result.valid : result);
          // Persist validity and then toggle on if valid.
          window.NEXUS.setStepValid(step, valid, { legacyId: legacyId, mirrorLegacy: !legacyId });

          if(valid){
            window.NEXUS.setStepToggle(step, true, { legacyId: legacyId, mirrorLegacy: !legacyId });
          }else{
            // Ensure toggle stays off if invalid.
            window.NEXUS.setStepToggle(step, false, { legacyId: legacyId, mirrorLegacy: !legacyId });
            try{
              const msg = (result && typeof result === "object" && result.message) ? String(result.message) : "Not complete: required items missing.";
              window.NEXUS.audit("step_invalid_attempt", { step:step, message:msg });
              // Optional: if a page provides a toast/alert hook, use it; else no-op.
              if(typeof window.NEXUS_toast === "function") window.NEXUS_toast(msg, { type:"warn" });
            }catch(e){}
          }
          refresh();
        });

        // Keep UI in sync if other code updates step state.
        window.addEventListener("nexus:stepchange", function(ev){
          try{
            const d = (ev && ev.detail) ? ev.detail : {};
            if(_normStep(d.step) !== step) return;
            refresh();
          }catch(e){}
        });

        refresh();
      }catch(e){}
    });
  };

  // Convenience: allow pages to request a one-shot refresh of step UI without binding.
  window.NEXUS.refreshStepUI = function(step){
    _applyStepUI(step);
  };

  document.addEventListener("DOMContentLoaded", function(){
    updateBanner();
    try{window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.syncRole==="function" && window.NEXUS_FIREBASE.syncRole();}catch(e){}
    try{ window.NEXUS.bindStepCompleteButtons(); }catch(e){}
  });
})();
