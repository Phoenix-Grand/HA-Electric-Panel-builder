# TODO

## First installation / release

- [ ] Install on a real Home Assistant instance and check setup, restart, entity discovery, shared saves, administrator / non-administrator permissions, entity details, and resource loading.
- [ ] Verify minimum supported Home Assistant release and current stable release; specifically validate WebSocket schema migration compatibility.
- [ ] Verify the companion dashboard's built-in Energy cards with real Energy preferences and recorder statistics.
- [x] Set Gitea repository documentation / issue tracker URLs and record Kudjo Grand as maintainer.
- [x] Add the maintainer's GitHub username, @Phoenix-Grand, to manifest.json codeowners.
- [x] Publish GitHub and Gitea repositories, tag v0.1.0, and attach the installation ZIP to the GitHub release.
- [x] Publish the public GitHub mirror at Phoenix-Grand/HA-Electric-Panel-builder for HACS; direct Gitea installation is not supported by HACS.
- [ ] Validate custom HACS installation on GitHub. Default catalog submission is optional and separate.

## Energy and monitoring

- [ ] Date-range circuit energy consumption using recorder statistics, linked to the Energy date selector.
- [ ] Explicit upstream device relationships and a reviewed synchronization workflow for Energy individual-device preferences.
- [ ] Entity rename assistance using stable registry references.
- [ ] Device grouping/search and measurement previews for large sensor inventories.
- [ ] Optional comparison graphs for multiple meters on one circuit.
- [ ] Dedicated handling for panel feed meters and multi-leg measurements.

## Panel editing

- [ ] Live layout update subscriptions across open dashboards, without losing unsaved forms.
- [ ] Undo/redo and duplicate panel / breaker commands.
- [ ] Configurable numbering conventions, label orientations, and manufacturer-specific layouts.
- [ ] More explicit custom half-slot circuit pairing visuals for unusual quad arrangements.
- [ ] Printable panel directory and photo attachments.
- [ ] Panel-level maintenance notes and circuit verification reminders.
- [ ] Optional migration/import from the separate Eagle's Nest energy inventory with explicit circuit/slot matching.

## Maintainability

- [ ] Automated Home Assistant runtime tests in Linux CI, including persistence and permission enforcement.
- [ ] Add browser checks to CI with pinned development dependencies.
- [ ] Internationalization and Home Assistant light/dark theme bindings.
- [ ] Accessibility audit, including screen-reader announcements and keyboard movement between spaces.
- [ ] Versioned document migrations before changing the version 1 schema.
- [ ] Release automation for version synchronization, tagging, and ZIP assets.
