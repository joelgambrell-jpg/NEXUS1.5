/* =========================================================
   NEXUS Vanguard Mapping Engine
   File: assets/js/nexus-vanguard-mapping.js
   ========================================================= */

(function(){
  "use strict";

  const ROOT = window;

  /* =========================================================
     BASIC UTILITIES
     ========================================================= */

  function now(){ return new Date().toISOString(); }

  function txt(v){ return (v == null ? "" : String(v)).trim(); }

  function arr(v){ return Array.isArray(v) ? v : (v ? [v] : []); }

  function eqKey(eq){ return "nexus_vanguard_equipment_" + eq; }

  function clone(o){
    try { return JSON.parse(JSON.stringify(o||{})); }
    catch(e){ return {}; }
  }

  function readJSON(k){
    try{ return JSON.parse(localStorage.getItem(k) || "null"); }
    catch(e){ return null; }
  }

  function writeJSON(k,v){
    try{ localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch(e){ return false; }
  }

  /* =========================================================
     TORQUE NORMALIZATION
     ========================================================= */

  function normalizeTorqueRow(r,i){
    return {
      connection: txt(r.connection || ("POINT-" + (i+1))),
      bolt: txt(r.bolt),
      boltType: txt(r.boltType),
      specValue: txt(r.specValue || r.torque),
      unit: txt(r.unit || "ft-lbs"),
      source: txt(r.source || "AI Mapping"),
      confidence: txt(r.confidence || "Medium"),
      status: "UNVALIDATED"
    };
  }

  function normalizeTorque(rows){
    return arr(rows).map(normalizeTorqueRow);
  }

  /* =========================================================
     PHENOLIC
     ========================================================= */

  function normalizePhenolic(p, eq){
    p = p || {};
    return {
      colorCode: txt(p.colorCode),
      equipId: txt(p.equipId || eq),
      fedFrom: txt(p.fedFrom),
      feeds: txt(p.feeds)
    };
  }

  /* =========================================================
     MEG
     ========================================================= */

  function normalizeMeg(m){
    m = m || {};
    return {
      threshold: txt(m.threshold || "11 MΩ"),
      standard: txt(m.standard || "AWS")
    };
  }

  /* =========================================================
     CCS
     ========================================================= */

  function normalizeCcs(c,type){
    c = c || {};
    return {
      template: txt(c.template || type || "transformer")
    };
  }

  /* =========================================================
     BUILD MAPPED OBJECT
     ========================================================= */

  function build(input){
    const eq = txt(input.eq || "NO_EQ");

    return {
      eq: eq,
      type: txt(input.type || "transformer"),
      building: txt(input.building),
      phase: txt(input.phase),
      pod: txt(input.pod),

      ai: {
        torque: normalizeTorque(input.torque),
        phenolic: normalizePhenolic(input.phenolic, eq),
        meg: normalizeMeg(input.meg),
        ccs: normalizeCcs(input.ccs, input.type),
        conflicts: arr(input.conflicts),
        sources: arr(input.sources),
        publishedAt: now()
      },

      status: {
        mapped: true,
        readyToPublish: true
      },

      updatedAt: now()
    };
  }

  /* =========================================================
     REGISTRY WRITE
     ========================================================= */

  function publish(input){
    const mapped = build(input);
    const eq = mapped.eq;

    // Save dedicated record
    writeJSON(eqKey(eq), mapped);

    // Merge into project registry
    let registry = readJSON("nexus_project_equipment") || [];

    const idx = registry.findIndex(r => r.eq === eq);
    if(idx >= 0) registry[idx] = {...registry[idx], ...mapped};
    else registry.push(mapped);

    writeJSON("nexus_project_equipment", registry);

    console.log("Vanguard Published:", mapped);
    return mapped;
  }

  /* =========================================================
     DEMO GENERATOR
     ========================================================= */

  function demo(eq){
    return publish({
      eq: eq,
      type: "transformer",
      building: "Bldg-01",
      phase: "Phase 1",
      pod: "POD A",

      torque: [
        {connection:"A-PHASE", bolt:'1/2"', specValue:"45"},
        {connection:"B-PHASE", bolt:'1/2"', specValue:"45"},
        {connection:"C-PHASE", bolt:'1/2"', specValue:"45"},
        {connection:"GROUND", bolt:'3/8"', specValue:"35"}
      ],

      phenolic:{
        colorCode:"bus_a_orange",
        fedFrom:"PDP-1A",
        feeds:"RTU-1"
      },

      meg:{
        threshold:"11 MΩ"
      },

      ccs:{
        template:"transformer"
      }
    });
  }

  /* =========================================================
     EXPORT
     ========================================================= */

  ROOT.NEXUS_VANGUARD = {
    publish,
    demo
  };

})();
