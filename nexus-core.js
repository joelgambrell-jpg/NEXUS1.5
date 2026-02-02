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

  document.addEventListener("DOMContentLoaded", function(){ updateBanner(); try{window.NEXUS_FIREBASE && typeof window.NEXUS_FIREBASE.syncRole==="function" && window.NEXUS_FIREBASE.syncRole();}catch(e){} });
})();