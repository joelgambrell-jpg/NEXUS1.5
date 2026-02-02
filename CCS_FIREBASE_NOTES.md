# NEXUS 1.3.4 — Construction Check Sheet (CCS) Firebase Migration Notes

## What changed in this build
- **Canonical page:** `ConstructionCheckSheet.html`
- `construction_check_sheet.html` and `construction.html` remain **redirect stubs** that forward `?eq=` to the canonical page.
- CCS now supports **multiple sheet records** per equipment (`Add Sheet`, `Remove`).
- **Role gating (UI only, pre-Firebase):** only `foreman`+ can Add/Remove sheets, add custom checklist lines, and Sign Off.
- **Solid background** for the sheet content (white panel) for readability.
- **Email automation ready:** on Sign Off, an `emailPayload` object is generated and stored with the signed record (no sending yet).

## Data model (localStorage now, Firestore later)
Stored as JSON under a single key per equipment:
- Key format: `nexus_${eq || "NO_EQ"}_construction_check_sheet_v2`

Payload shape:
```json
{
  "eq": "<equipment string>",
  "meta": { "building": "", "phase": "", "pod": "", "foreman": "" },
  "records": [
    {
      "id": "rec_<...>",
      "equipmentName": "LV Transformer 001",
      "equipId": "",
      "dateInt": "",
      "notes": "",
      "rifCompleted": false,
      "labels": { "phenolic": false, "arcFlash": false },
      "checklist": {
        "item_<...>": { "date": "", "initials": "", "notes": "", "complete": false }
      },
      "customItems": [
        { "id": "custom_<...>", "text": "", "date": "", "initials": "", "notes": "", "complete": false }
      ],
      "signoff": { "constructionForeman": "", "qcxForeman": "", "date": "" },
      "signedOff": false,
      "signedOffAt": null,
      "signedOffByRole": null,
      "emailPayload": null
    }
  ],
  "updatedAt": "2026-01-19T...Z"
}
```

## Firebase mapping (recommended)
### Option A: subcollection per equipment
- `equipment/{eqId}/constructionSheets/{recordId}`
  - store each `record` as a document

### Option B: project-centric
- `projects/{projectId}/equipment/{eqId}/constructionSheets/{recordId}`

## Access control (Firebase phase)
### Roles
- `viewer`, `tech`, `foreman`, `superintendent`, `admin`

### Required enforcement
- Only `foreman`+ can:
  - create/delete sheet records
  - add custom checklist lines
  - set `signedOff=true`
- After signoff:
  - block edits unless `admin` (recommended)

## Email automation (Firebase phase)
Trigger condition:
- `signedOff` transitions from `false` to `true`

Implementation:
- Cloud Function on document write:
  - if transition detected, send email using `emailPayload` OR generate server-side

## Firebase hook placeholders in UI
`ConstructionCheckSheet.html` calls the following (only if present):
- `window.nexusFirebase.saveSheet(eq, "construction", payload)`

Provide an implementation later in your Firebase module.
