# Home Assistant Panel Builder

A visual US electrical panel inventory, dashboard card, and local Home Assistant integration. Build a panel, name each circuit, assign existing energy-monitoring sensors, and keep dated notes. Version **0.1.0**.

Maintainer: **Kudjo Grand** · gpenrod@gmail.com. Source: [kudjo/HA-Electric-Panel-builder](https://git.cdsfellows.com/kudjo/HA-Electric-Panel-builder). Report issues in the [repository issue tracker](https://git.cdsfellows.com/kudjo/HA-Electric-Panel-builder/issues).

HACS mirror: [Phoenix-Grand/HA-Electric-Panel-builder](https://github.com/Phoenix-Grand/HA-Electric-Panel-builder).

## What it does

- Preset **8, 12, 16, 20, 24, 30, 40, 42, 54, and 60-space panels**, or a custom **1–120 spaces**. Multiple named panels are supported.
- Odd-numbered spaces down the left, even-numbered spaces down the right. Breakers span adjacent rows on the same side: a two-pole breaker starting at 1 occupies **1 and 3**.
- Single-pole, two-pole, three-pole, tandem, quad, and custom footprints of up to six spaces / six circuits. A 60 A two-pole breaker is one 60 A circuit across two spaces. A tandem can be two independent 20 A circuits in one space.
- Each circuit has a name, amp rating, verification date, its own monitors, and dated notes. Tandem and quad circuits retain independent records.
- Discover existing Home Assistant power, energy, and current sensor entities, grouped by device name. Assign multiple devices or channels to each circuit, with explicit whole-circuit, comparison, or device-only scope.
- Display current sensor states and open Home Assistant's entity details. Unknown, unavailable, and removed sensors are shown explicitly.
- Save layouts centrally in Home Assistant; export/import readable JSON for backups and Git. Changes remain staged until **Save panel**.
- Protect against overlapping breakers, out-of-panel footprints, unsafe resizing, duplicate primary measurements, and conflicting edits from another session.
- Export an Energy dashboard sensor checklist and an editable dashboard view containing the panel plus built-in Energy cards.

The layout is an inventory of the actual installed equipment. Its generic numbering is configurable through breaker starting positions, but other numbering conventions, bus phases, and electrical compatibility are not modeled. Breaker amp ratings are labels, not measured consumption or a calculation of service capacity. Actual tandem/quad placement and permitted breakers depend on the panel labeling. This tool does not operate breakers.

## Try the local preview

Requires Node.js 20 or later. No package installation or build is needed:

```sh
npm start
```

Open **http://127.0.0.1:8099**. The example is a 40-space panel with simulated sensors; it does not read your existing energy diagrams or connect to your Home Assistant. Saves in this preview use browser-local storage. **Reset example** clears only preview data. Export JSON to transfer a layout you create into the real card.

## Install in Home Assistant

Designed for Home Assistant **2025.1 or newer**, including the current asynchronous static-file registration API. WebSocket commands use plain schema fields plus explicit server-side document validation to avoid depending on library-specific schema markers. Browser workflows and the standalone validation/persistence code are tested; a live Home Assistant installation has not yet been verified. See TODO.md for the compatibility checklist.

1. Copy `custom_components/panel_builder/` from this repository into your Home Assistant configuration folder, resulting in:

   ```text
   /config/custom_components/panel_builder/manifest.json
   /config/custom_components/panel_builder/frontend/panel-builder.js
   ```

   The release ZIP contains the same `custom_components` structure. Extract it into your Home Assistant configuration folder.

2. Restart Home Assistant.
3. Go to **Settings → Devices & services → Add integration**, search for **Panel Builder**, and add it. It requires no token or credentials.
4. In **Settings → Dashboards → Resources** (enable Advanced mode in your profile if needed), add:

   ```text
   URL:  /panel_builder/panel-builder.js?v=0.1.0
   Type: JavaScript module
   ```

   For dashboards that manage resources in YAML:

   ```yaml
   lovelace:
     resources:
       - url: /panel_builder/panel-builder.js?v=0.1.0
         type: module
   ```

   This is configuration-level resource registration, not a card. See [Home Assistant resource registration](https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources/).

5. Add the **Panel Builder** card to an editable dashboard. It appears in the card picker. A minimal manual card configuration is:

   ```yaml
   type: custom:panel-builder-card
   ```

6. Create a panel, select **40 spaces** or another size, and save it. Use **Panel settings** to find its stable panel ID. To bind a particular dashboard card to it:

   ```yaml
   type: custom:panel-builder-card
   panel_id: main-panel  # Replace with the ID in your Panel settings.
   ```

   With no `panel_id`, the card uses the first saved panel. With a new explicit ID, an administrator can create a panel with that ID. The panel selector also allows browsing other saved panels; the configured ID is the initial selection when the card loads.

7. For a dashboard intended only for viewing:

   ```yaml
   type: custom:panel-builder-card
   panel_id: main-panel
   read_only: true
   ```

Home Assistant administrators can edit. Other authenticated users can view panel inventories; writes and deletes are also protected on the backend. `read_only` is a presentation setting, not a substitute for Home Assistant account permissions. Monitor discovery respects entity read permissions.

### Optional HACS installation

The repository includes a HACS integration manifest and a normal `custom_components` layout. **HACS cannot install from the Gitea URL.** Its [repository requirements](https://hacs.dev/docs/publish/start/) support public GitHub repositories only. Use the [public GitHub mirror](https://github.com/Phoenix-Grand/HA-Electric-Panel-builder) for HACS and Gitea as the primary source.

To try HACS:

1. Open **HACS → menu → Custom repositories**.
2. Enter **https://github.com/Phoenix-Grand/HA-Electric-Panel-builder** and select type **Integration**.
3. Download **Panel Builder**, then restart Home Assistant.
4. Follow steps **3–7** above to add the integration, register its JavaScript resource, and add the dashboard card.

A GitHub release is optional for testing: HACS can install the default branch. A Git tag alone is not a GitHub release. The project has not been submitted to HACS's default catalog. The maintainer's GitHub username, `@Phoenix-Grand`, is recorded in the integration manifest.

For testing directly from Gitea, download the repository archive, extract it, and copy only `custom_components/panel_builder/` into `/config/custom_components/`, then follow the manual installation steps above.

## Build your panel

1. Click an empty physical space. Choose the breaker type, starting space, and circuit name/rating. Multi-space footprints stay on one side of the panel.
2. For a tandem, configure circuits **A** and **B** separately. For a quad, record the actual circuit pairing shown on the breaker labeling. Custom footprints let you document less common arrangements.
3. Assign the appropriate existing Home Assistant sensor entities. A monitoring device with power and energy sensors has two selectable entities; assign both when you want both readings.
4. Choose each monitor's scope:

   | Scope | Meaning |
   | --- | --- |
   | Primary whole circuit | The chosen sensor measuring the entire circuit. One per measurement type. |
   | Comparison meter | Another observation of that circuit, such as a second provider's CT channel. |
   | Device on this circuit | A smart plug or submeter covering only a load within the circuit. |

5. Add a verification date and dated notes. Dates indicate when information was checked; they are entered explicitly rather than automatically assuming that every edit verified the circuit. Notes are retained as separate entries; remove or append entries to correct them.
6. Click **Apply breaker** to stage the record in the layout, then **Save panel** to commit the panel to shared storage. **Reload** gets the latest saved layout and monitor inventory. Live sensor readings update without replacing the form you are editing.

Changes to breaker type that remove extra circuits require confirmation because the extra circuit notes and assignments will be removed. Removing a breaker or deleting a panel also requires confirmation. Resizing never silently removes occupied circuits. Save conflicts keep your edits available: export them before reloading the newer saved version.

## Use alongside Home Assistant Energy

This card works on editable dashboards, including an energy-focused dashboard. Home Assistant documents [using built-in Energy cards in other dashboards](https://www.home-assistant.io/dashboards/energy/). Use **Energy setup → Export dashboard view** to download a view with `energy-date-selection`, `energy-usage-graph`, `energy-devices-graph`, and your Panel Builder card. Insert the view into an existing dashboard's `views` list; resource registration is separate.

The generated built-in Energy dashboard is managed by Home Assistant; this integration does not patch that built-in view or automatically rewrite Energy preferences. Add the primary energy sensors listed in **Energy setup** under **Settings → Energy → Individual devices**. The exported sensor list is a checklist, not an import payload for Energy preferences.

Energy sensor metadata checks require `device_class: energy`, an appropriate energy unit, and `state_class: total` or `total_increasing`. Recorder exclusions, statistics issues, and actual measurement coverage still need checking in Home Assistant. A power sensor in watts is not cumulative energy; create an [Integral helper](https://www.home-assistant.io/integrations/integration/) when needed. See [Energy sensor requirements](https://www.home-assistant.io/docs/energy/faq/).

Comparison meters and device-only monitors are excluded from the primary circuit checklist. A primary entity reused on several circuits is flagged and included only once in the checklist. The card does not add sensor values together, so a circuit CT plus a smart plug on that circuit cannot inflate a displayed total. If you add nested device sensors to Energy, configure their upstream relationships there.

**Reading semantics:** power and current are the entity's current state; energy is the entity's cumulative counter. The panel does not calculate daily consumption or follow the Energy date selector. The built-in Energy cards provide historical date-range graphs using your configured Energy sources.

## Storage and backups

In Home Assistant, documents are stored using its versioned `Store` helper in `.storage/panel_builder.panels`. Exported JSON includes circuit/assignment/note IDs, physical placement, dates, revision, and last successful save time. Keep exports in your own Git repository if you want layout history. Standard Home Assistant backups also include integration storage.

Do not manually edit `.storage` while Home Assistant is running. Removing the integration leaves its documents available for re-adding it; **Delete panel** explicitly removes an individual document. Other open cards refresh layouts with **Reload**; automatic layout subscriptions are on the roadmap.

Sensor assignments reference existing entity IDs; this integration creates no new sensor entities. Renamed entities require reassignment. Device IDs are metadata snapshots associated with the selected sensor. Disabled entities without a live state do not appear in discovery; existing assignments are preserved and shown as missing/unavailable.

## Development and source control

This subdirectory is a standalone repository. Frontend source is served directly from `custom_components/panel_builder/frontend/`: no generated JavaScript bundle, CDN, or runtime third-party package is required. The local preview runs the same card against a simulated `hass` object.

```text
custom_components/panel_builder/   Integration, API, validation, persistence, frontend
demo/                             Simulated Home Assistant sensors and browser storage
tests/                            Model, persistence, and browser workflow checks
scripts/                          Local preview and deterministic release packaging
.github/workflows/checks.yml       GitHub CI checks; commands also work with Gitea CI
README.md / changelog.md / TODO.md  Installation, release history, development roadmap
```

Run the core tests and create an installation archive:

```sh
npm test
python -m unittest discover -s tests -p 'test_*.py'
python -m compileall -q custom_components
python scripts/package_release.py
```

The archive is written to `release/panel-builder-0.1.0.zip` (ignored by Git). Packaging includes only the integration and documentation, excluding preview browser data and development artifacts.

Optional browser checks require Playwright and its Chromium browser. Install them in your development environment, start the preview, then run:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/browser-smoke.mjs
```

`BROWSER_CHANNEL=msedge` uses an installed Edge instead. `PLAYWRIGHT_MODULE` can point to an existing Playwright package and `PREVIEW_URL` can override the preview URL. Screenshots go to ignored `.verification/`. The browser check uses a fresh browser profile and tests editing, persistence, conflicts, failure recovery, imports/exports, read-only access, and mobile overflow. It does not validate the Home Assistant runtime itself.

The primary remote is:

```text
git@git.cdsfellows.com:kudjo/HA-Electric-Panel-builder.git
```

For subsequent changes:

```sh
git add .
git commit -m "Describe the update"
git push -u origin main
git push github main
```

Keep changes in `changelog.md`, future work in `TODO.md`, and synchronize the version in `package.json`, `manifest.json`, the UI, and dashboard resource examples. After upgrading, restart Home Assistant and change the resource's version query parameter to refresh browser caches.

## Troubleshooting

- **Custom element doesn't exist:** check resource URL/type, clear the browser cache, and ensure the full `frontend` folder was installed.
- **Could not load Panel Builder:** check integration setup and Home Assistant logs. Do not substitute browser-local demo storage for a failed Home Assistant connection.
- **Monitor missing from the selector:** check the sensor is enabled, has a state, and reports energy, power, or current metadata/units. Use Reload after adding devices.
- **Energy metadata says “Check sensor”:** review the unit, device class, state class, and Home Assistant statistics diagnostics.
- **Save conflict:** export your local work, reload, then compare and reapply changes. Imports with a matching ID replace that panel only after you save them.
- **Save failed:** edits remain staged. Export a backup and check available Home Assistant storage before retrying.

Licensed under MIT. See `LICENSE`.
