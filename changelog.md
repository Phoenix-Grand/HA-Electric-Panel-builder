# Changelog

## 0.1.1 — 2026-10-09

- Correct Energy setup navigation with a direct link to Electricity configuration and Individual electrical devices.
- Show primary power assignments in the checklist and explain existing energy counters before suggesting Integral helpers.
- Include a native historical energy Sankey, shared date collection, and deduplicated 24-hour primary circuit power histories in dashboard exports.
- Provide separate view and complete-new-dashboard YAML exports with explicit Raw configuration editor instructions and unique panel-specific paths.
- Preserve the working v0.1.0 source with tag `working-before-energy-dashboard-2026-10-09` before these changes. Saved panel data remains version 1.

## 0.1.0 — 2026-10-09

- Initial Home Assistant integration and native dashboard card.
- Visual US panel layout with common presets, custom space counts, and multiple panels.
- Single-, two-, and three-pole breakers, tandems, quads, and custom footprints.
- Independent circuit names, amp ratings, verification dates, and dated notes.
- Home Assistant device/sensor discovery, monitor scope assignments, and live entity readings.
- Shared versioned storage with administrator-only writes and optimistic concurrency checks.
- Collision, footprint, resize, date, identity, and assignment validation on frontend and backend.
- JSON import/export, primary energy sensor checklist, and companion Energy dashboard YAML view export.
- Local preview with explicitly simulated data and browser persistence.
- Git-ready layout, HACS custom integration metadata, GitHub CI, and deterministic installation ZIP.
- Primary repository and issue tracker configured for kudjo/HA-Electric-Panel-builder on git.cdsfellows.com, maintained by Kudjo Grand.
- Documented public GitHub mirror requirement and custom Integration installation steps for HACS.
- HACS mirror configured at Phoenix-Grand/HA-Electric-Panel-builder with @Phoenix-Grand as code owner.
- Published v0.1.0 to Gitea and GitHub with an installation ZIP attached to the GitHub release; GitHub automated checks passed.
- Model, persistence, and browser workflow tests; live Home Assistant commissioning remains on the roadmap.
