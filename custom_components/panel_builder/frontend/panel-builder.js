import { KINDS, clone, id, localDate, newPanel, newBreaker, newCircuit, occupiedSpaces, validatePanel, putBreaker, panelSummary, sensorMeasurement, energyEligible, energyPlan, dashboardYaml, sharedEntities } from './model.js';
import { styles } from './styles.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const field = (label, control) => `<label class="field"><span>${label}</span>${control}</label>`;
const input = (name, value, attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
const options = (items, value) => items.map(([v, label]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
const fmtDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not verified';
function reading(states, entityId) {
  const state = states?.[entityId];
  if (!state) return 'Entity not found';
  if (['unavailable', 'unknown', ''].includes(state.state) || !Number.isFinite(Number(state.state))) return 'Unavailable';
  return `${Number(state.state).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${state.attributes?.unit_of_measurement || ''}`.trim();
}
export class PanelBuilderCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({ mode: 'open' }); this._panels = []; this._catalog = []; this._config = {}; this._scratch = {}; this._dirty = false; this._editorDirty = false;
    this.shadowRoot.addEventListener('click', event => this._click(event));
    this.shadowRoot.addEventListener('change', event => this._change(event));
    this.shadowRoot.addEventListener('input', event => { if (event.target.closest('#breaker-form')) this._editorDirty = true; });
    this._beforeUnload = e => { if (this._dirty || this._editorDirty) { e.preventDefault(); e.returnValue = ''; } };
  }
  setConfig(config) {
    const oldId = this._config.panel_id;
    if (config.panel_id !== undefined && !/^[a-zA-Z0-9_-]{1,64}$/.test(config.panel_id)) throw new Error('panel_id must be a valid panel ID.');
    this._config = { ...config };
    if (oldId !== config.panel_id && this._loaded && !this._dirty) { this._panel = clone(this._panels.find(p => p.id === config.panel_id) || this._panels[0] || null); this._draft = null; }
    this._render();
  }
  set hass(hass) { this._hass = hass; if (!this._loaded && !this._loading) this._load(); else this._updateLive(); }
  get hass() { return this._hass; }
  connectedCallback() { window.addEventListener('beforeunload', this._beforeUnload); this._render(); }
  disconnectedCallback() { window.removeEventListener('beforeunload', this._beforeUnload); }
  getCardSize() { return Math.ceil((this._panel?.spaces || 40) / 2) + 5; }
  getGridOptions() { return { columns: 'full', min_columns: 12 }; }
  static getStubConfig() { return {}; }
  static getConfigElement() { return document.createElement('panel-builder-card-editor'); }
  get _canEdit() { return Boolean(this._hass?.user?.is_admin) && !this._config.read_only; }
  async _load() {
    if (!this._hass?.callWS) return;
    this._loading = true; this._error = ''; this._message = null;
    try {
      const [result, catalog] = await Promise.all([this._hass.callWS({ type: 'panel_builder/list' }), this._hass.callWS({ type: 'panel_builder/monitors' })]);
      this._panels = result.panels; this._catalog = catalog.entities;
      const previous = this._panel?.id || this._config.panel_id;
      const target = this._panels.find(p => p.id === previous);
      this._panel = clone(target || (previous ? null : this._panels[0]) || null);
      this._loaded = true; this._dirty = false; this._draft = null; this._editorDirty = false;
      if (previous && !target) this._message = { text: `Panel ${previous} is not saved yet. Create a panel with this ID or select another panel.`, kind: '' };
    } catch (e) { this._error = `Could not load Panel Builder. Check that the integration is installed and enabled. ${e.message || e.code || e}`; }
    finally { this._loading = false; this._render(); }
  }
  _tell(text, kind = 'success') { this._message = { text, kind }; this._render(); }
  _abandonEditor() { return !this._editorDirty || window.confirm('Discard the unapplied breaker edits?'); }
  _discardPanel() { return (!this._dirty && !this._editorDirty) || window.confirm('Discard unsaved changes to this panel?'); }
  _select(start) {
    if (!this._abandonEditor()) return;
    const breaker = this._panel.breakers.find(b => occupiedSpaces(b).includes(start));
    this._draft = clone(breaker || newBreaker(start)); this._scratch = {}; this._editorDirty = false; this._message = null; this._render();
    if (window.innerWidth <= 760) this.shadowRoot.querySelector('.rail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  _readDraft() {
    if (!this._draft) return;
    const form = this.shadowRoot.querySelector('#breaker-form');
    if (!form) return;
    const value = name => form.elements.namedItem(name)?.value;
    this._draft.start = Number(value('start'));
    this._draft.spaces = Number(value('spaces') || KINDS[this._draft.kind].spaces);
    this._draft.circuits.forEach((c, i) => {
      c.name = value(`name-${i}`) ?? c.name; c.amps = Number(value(`amps-${i}`) ?? c.amps); c.verifiedOn = value(`verified-${i}`) ?? c.verifiedOn;
      this._scratch[c.id] = { note: value(`note-${i}`) || '', date: value(`note-date-${i}`) || localDate(), entity: value(`entity-${i}`) || '', role: value(`role-${i}`) || 'circuit' };
    });
  }
  _apply() {
    this._readDraft();
    if (this._draft.circuits.some(c => this._scratch[c.id]?.note.trim())) throw new Error('Click Add dated note to keep the note you typed before applying the breaker.');
    this._panel = putBreaker(this._panel, this._draft); this._dirty = true; this._editorDirty = false;
  }
  async _save() {
    if (!this._canEdit) return;
    try {
      if (this._editorDirty) this._apply();
      validatePanel(this._panel); this._busy = true; this._render();
      const saved = await this._hass.callWS({ type: 'panel_builder/save', panel: this._panel });
      this._panel = clone(saved); this._panels = [...this._panels.filter(p => p.id !== saved.id), clone(saved)]; this._dirty = false;
      this._message = { text: 'Panel saved. Layout, monitors, and notes are available on every dashboard using this panel ID.', kind: 'success' };
    } catch (e) { this._message = { text: e.code === 'conflict' ? 'Another session changed this panel. Export your work first, then reload to review the saved version.' : `Save failed: ${e.message || e.code || e}. Your edits are still here.`, kind: 'error' }; }
    finally { this._busy = false; this._render(); }
  }
  _download(name, text, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async _click(event) {
    const button = event.target.closest('button[data-action]'); if (!button || this._busy) return;
    const action = button.dataset.action;
    const editing = ['new', 'settings', 'apply', 'save', 'remove', 'delete-panel', 'add-note', 'remove-note', 'add-monitor', 'remove-monitor', 'save-settings', 'import'];
    if (editing.includes(action) && !this._canEdit) return;
    try {
      if (action === 'slot') this._select(Number(button.dataset.start));
      else if (action === 'apply') { this._apply(); this._tell('Breaker applied to the layout. Save panel to keep your changes.'); }
      else if (action === 'save') await this._save();
      else if (action === 'close-editor') { if (this._abandonEditor()) { this._draft = null; this._editorDirty = false; this._render(); } }
      else if (action === 'remove') {
        if (!window.confirm('Remove this breaker and its circuit assignments and notes?')) return;
        this._panel.breakers = this._panel.breakers.filter(b => b.id !== this._draft.id); this._draft = null; this._dirty = true; this._editorDirty = false; this._tell('Breaker removed from the layout. Save panel to keep this change.');
      } else if (action === 'reload') { if (this._discardPanel()) { this._loaded = false; await this._load(); } }
      else if (action === 'new') {
        if (!this._discardPanel()) return;
        this._modal = { type: 'settings', new: true }; this._render();
      } else if (action === 'settings') { if (!this._abandonEditor()) return; this._draft = null; this._editorDirty = false; this._modal = { type: 'settings', new: false }; this._render(); }
      else if (action === 'modal-close') { this._modal = null; this._render(); }
      else if (action === 'save-settings') {
        const form = this.shadowRoot.querySelector('#settings-form'); const data = new FormData(form);
        const size = Number(data.get('preset') === 'custom' ? data.get('custom-spaces') : data.get('preset'));
        const candidate = this._modal.new ? newPanel(String(data.get('name')), size, this._config.panel_id && !this._panels.some(p => p.id === this._config.panel_id) ? this._config.panel_id : id()) : clone(this._panel);
        Object.assign(candidate, { name: String(data.get('name')).trim(), spaces: size, mainAmps: Number(data.get('main')), location: String(data.get('location')), manufacturer: String(data.get('manufacturer')) });
        validatePanel(candidate); this._panel = candidate; this._dirty = true; this._modal = null; this._draft = null; this._editorDirty = false; this._tell('Panel settings applied. Save panel to keep your changes.');
      } else if (action === 'add-note' || action === 'add-monitor' || action === 'remove-note' || action === 'remove-monitor') {
        this._readDraft(); const index = Number(button.dataset.circuit); const circuit = this._draft.circuits[index];
        if (action === 'add-note') {
          const text = this.shadowRoot.querySelector(`[name="note-${index}"]`).value.trim(); const date = this.shadowRoot.querySelector(`[name="note-date-${index}"]`).value;
          if (!text || !date) throw new Error('Enter a note and its date.');
          circuit.notes.push({ id: id(), date, text }); this._scratch[circuit.id].note = '';
        } else if (action === 'add-monitor') {
          const entityId = this.shadowRoot.querySelector(`[name="entity-${index}"]`).value;
          const role = this.shadowRoot.querySelector(`[name="role-${index}"]`).value;
          const entity = this._catalog.find(e => e.entityId === entityId);
          if (!entity) throw new Error('Choose a Home Assistant monitor entity.');
          if (circuit.assignments.some(a => a.entityId === entityId)) throw new Error('This entity is already assigned to this circuit.');
          const measurement = entity.measurement || sensorMeasurement(this._hass.states[entityId]);
          if (role === 'circuit' && circuit.assignments.some(a => a.role === role && a.measurement === measurement)) throw new Error('A primary sensor for this measurement already exists. Choose Comparison meter for this additional sensor.');
          circuit.assignments.push({ id: id(), entityId, role, measurement, deviceId: entity.deviceId || '', label: entity.deviceName || entity.name }); this._scratch[circuit.id].entity = '';
        } else if (action === 'remove-note') circuit.notes = circuit.notes.filter(n => n.id !== button.dataset.id);
        else circuit.assignments = circuit.assignments.filter(a => a.id !== button.dataset.id);
        this._editorDirty = true; this._render();
      } else if (action === 'export') {
        if (this._editorDirty) throw new Error('Apply breaker edits before exporting.');
        validatePanel(this._panel); this._download(`${this._panel.id}.json`, JSON.stringify(this._panel, null, 2) + '\n'); this._tell('Panel JSON exported, ready to back up or commit to Git.');
      } else if (action === 'yaml' || action === 'yaml-dashboard') { this._download(action === 'yaml' ? 'panel-energy-view.yaml' : 'panel-energy-dashboard.yaml', dashboardYaml(this._panel, action === 'yaml-dashboard'), 'text/yaml'); }
      else if (action === 'energy') { this._readDraft(); this._modal = { type: 'energy' }; this._render(); }
      else if (action === 'energy-export') this._download('energy-assignments.json', JSON.stringify(energyPlan(this._panel, this._hass.states), null, 2) + '\n');
      else if (action === 'import') this.shadowRoot.querySelector('#import-file').click();
      else if (action === 'delete-panel') {
        if (!window.confirm('Permanently delete this saved panel, including all circuit notes and assignments? Export a backup first if needed.')) return;
        if (this._panel.revision) await this._hass.callWS({ type: 'panel_builder/delete', panel_id: this._panel.id, revision: this._panel.revision });
        this._panels = this._panels.filter(p => p.id !== this._panel.id); this._panel = clone(this._panels[0] || null); this._draft = null; this._dirty = false; this._editorDirty = false; this._modal = null; this._tell('Panel deleted.');
      } else if (action === 'more-info') this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: button.dataset.entity }, bubbles: true, composed: true }));
    } catch (e) {
      if (this._modal) { const error = this.shadowRoot.querySelector('#modal-error'); if (error) { error.textContent = e.message || String(e); error.classList.remove('hide'); } }
      else { this._readDraft(); this._tell(e.message || String(e), 'error'); }
    }
  }
  async _change(event) {
    const target = event.target;
    try {
      if (target.id === 'panel-select') {
        if (!this._discardPanel()) { target.value = this._panel?.id || ''; return; }
        this._panel = clone(this._panels.find(p => p.id === target.value)); this._draft = null; this._dirty = false; this._editorDirty = false; this._message = null; this._render();
      } else if (target.name === 'kind' || target.name === 'custom-circuits') {
        this._readDraft(); const kind = target.name === 'kind' ? target.value : this._draft.kind; const shape = KINDS[kind];
        const count = kind === 'custom' ? Number(this.shadowRoot.querySelector('[name="custom-circuits"]')?.value || this._draft.circuits.length) : shape.circuits;
        if (count < this._draft.circuits.length && !window.confirm('Changing this type will remove extra circuits, including their notes and monitors. Continue?')) { target.value = target.name === 'kind' ? this._draft.kind : this._draft.circuits.length; return; }
        this._draft.kind = kind; if (kind !== 'custom') this._draft.spaces = shape.spaces;
        while (this._draft.circuits.length < count) this._draft.circuits.push(newCircuit()); this._draft.circuits.length = count; this._editorDirty = true; this._render();
      } else if (target.name === 'preset') this.shadowRoot.querySelector('#custom-size').classList.toggle('hide', target.value !== 'custom');
      else if (target.id === 'import-file') {
        if (!this._canEdit || !target.files[0]) return;
        if (!this._discardPanel()) return;
        if (target.files[0].size > 2_000_000) throw new Error('Panel file must be smaller than 2 MB.');
        const panel = validatePanel(JSON.parse(await target.files[0].text()));
        const existing = this._panels.find(p => p.id === panel.id);
        if (existing && !window.confirm(`Replace the saved layout for ${existing.name} with this import? The replacement takes effect when you save.`)) return;
        panel.revision = existing?.revision || 0; this._panel = panel; this._dirty = true; this._draft = null; this._editorDirty = false; this._tell('Panel imported. Review it, then Save panel to keep it.');
      }
    } catch (e) { this._tell(e.message || String(e), 'error'); }
  }
  _circuitMarkup(circuit, index) {
    const edit = this._canEdit; const disabled = edit ? '' : 'disabled'; const scratch = this._scratch[circuit.id] || {};
    const date = circuit.verifiedOn; const age = date ? Math.floor((Date.now() - new Date(date + 'T12:00:00').getTime()) / 86400000) : null;
    return `<div class="section circuit-detail"><h3>${this._draft.circuits.length > 1 ? `Circuit ${String.fromCharCode(65 + index)}` : 'Circuit details'}</h3>
      ${field('Circuit name', input(`name-${index}`, circuit.name, `maxlength="100" placeholder="e.g. Kitchen outlets" ${disabled}`))}
      <div class="row">${field('Breaker rating · amps', input(`amps-${index}`, circuit.amps, `type="number" min="1" max="1000" ${disabled}`))}${field('Last verified', input(`verified-${index}`, date, `type="date" ${disabled}`))}</div>
      <p class="help ${age > 365 ? 'age' : ''}">${esc(fmtDate(date))}${age !== null ? ` · ${age >= 0 ? `${age} days ago` : 'future date'}` : ' · add a date when you confirm this circuit'}</p>
      <div class="section"><h3>Energy monitors <span class="badge">${circuit.assignments.length}</span></h3>
      ${circuit.assignments.map(a => `<div class="assignment"><div class="line"><strong>${esc(a.label || a.entityId)}</strong>${edit ? `<button type="button" class="small link" data-action="remove-monitor" data-circuit="${index}" data-id="${esc(a.id)}" aria-label="Remove ${esc(a.entityId)}">Remove</button>` : ''}</div><div>${esc(a.entityId)}</div><span class="reading" data-reading="${esc(a.entityId)}">${esc(reading(this._hass?.states, a.entityId))}</span><span class="badge">${a.role === 'circuit' ? 'Primary whole circuit' : a.role === 'comparison' ? 'Comparison meter' : 'Device on circuit'} · ${esc(a.measurement)}</span>${a.measurement === 'energy' ? `<p class="help">${energyEligible(this._hass?.states?.[a.entityId]) ? 'Energy metadata ready · cumulative reading' : 'Check energy sensor metadata / availability'}</p>` : ''}<button type="button" class="link small" data-action="more-info" data-entity="${esc(a.entityId)}">View entity</button></div>`).join('') || '<p class="help">No monitor assigned.</p>'}
      ${edit ? `<div style="margin-top:12px">${field('Home Assistant device / sensor', `<select name="entity-${index}"><option value="">Select a monitor…</option>${this._catalog.map(e => `<option value="${esc(e.entityId)}" ${e.entityId === scratch.entity ? 'selected' : ''}>${esc(e.deviceName ? e.deviceName + ' · ' : '')}${esc(e.name)} (${esc(e.measurement)})</option>`).join('')}</select>`)}${field('Measurement scope', `<select name="role-${index}">${options([['circuit', 'Primary whole circuit'], ['comparison', 'Comparison meter'], ['device', 'Device on this circuit']], scratch.role || 'circuit')}</select>`)}<button type="button" class="small" data-action="add-monitor" data-circuit="${index}">Assign monitor</button><p class="help" style="margin-top:8px">Assign each power / energy / current entity you need. Comparison meters and device monitors remain separate.</p></div>` : ''}</div>
      <div class="section"><h3>Dated notes</h3>${[...circuit.notes].sort((a,b) => b.date.localeCompare(a.date)).map(n => `<div class="note"><div class="line"><small>${esc(fmtDate(n.date))}</small>${edit ? `<button type="button" class="link small" data-action="remove-note" data-circuit="${index}" data-id="${esc(n.id)}">Remove</button>` : ''}</div>${esc(n.text)}</div>`).join('') || '<p class="help">No notes yet.</p>'}
      ${edit ? `<div style="margin-top:12px">${field('Note date', input(`note-date-${index}`, scratch.date || localDate(), 'type="date"'))}${field('What changed or needs checking?', `<textarea name="note-${index}" maxlength="4000" placeholder="e.g. Confirmed garage freezer is on this circuit.">${esc(scratch.note || '')}</textarea>`)}<button type="button" class="small" data-action="add-note" data-circuit="${index}">Add dated note</button></div>` : ''}</div></div>`;
  }
  _railMarkup() {
    if (!this._draft) return `<aside class="rail"><div class="rail-header"><h2>Circuit details</h2><span class="badge">${this._canEdit ? 'Editor' : 'View only'}</span></div><div class="rail-body intro"><div class="intro-icon">⌁</div><h2>Every circuit has a place.</h2><p>Select a breaker to see its circuit, monitors, and notes.${this._canEdit ? ' Select an empty space to add one.' : ''}</p><ol><li>Choose the breaker type and its footprint.</li><li>Name each circuit and record its amp rating.</li><li>Assign Home Assistant sensors and date your notes.</li></ol><p>Odd spaces run down the left; even spaces run down the right. Multi-space breakers occupy adjacent rows on the same side.</p></div></aside>`;
    const b = this._draft; const edit = this._canEdit; const disabled = edit ? '' : 'disabled';
    return `<aside class="rail ${edit ? '' : 'read-only'}"><div class="rail-header"><div><div class="eyebrow">Spaces ${occupiedSpaces(b).join(' / ')}</div><h2>${this._panel.breakers.some(x => x.id === b.id) ? 'Breaker details' : 'Add a breaker'}</h2></div><button class="small" data-action="close-editor" aria-label="Close breaker editor">✕</button></div><form id="breaker-form" class="rail-body" onsubmit="return false">
      ${field('Breaker type', `<select name="kind" ${disabled}>${options(Object.entries(KINDS).map(([v,s]) => [v,s.label]), b.kind)}</select>`)}
      <div class="row">${field('Starting space', input('start', b.start, `type="number" min="1" max="${this._panel.spaces}" ${disabled}`))}${b.kind === 'custom' ? field('Physical spaces', input('spaces', b.spaces, `type="number" min="1" max="6" ${disabled}`)) : `<div class="field"><span>Physical spaces</span><p style="padding:9px 0">${b.spaces} space${b.spaces > 1 ? 's' : ''}</p></div>`}</div>
      ${b.kind === 'custom' ? field('Independent circuits', `<select name="custom-circuits" ${disabled}>${options([1,2,3,4,5,6].map(n => [String(n), String(n)]), String(b.circuits.length))}</select>`) : ''}
      <p class="help">${b.kind === 'double' ? 'One circuit across two spaces. The amp rating applies to the breaker; it is not doubled.' : b.kind === 'tandem' ? 'Two independent circuits share one physical space. Give each its own rating and monitors.' : b.kind === 'quad' ? 'Two circuits share two physical spaces. Record the actual circuit pairing from the breaker labeling.' : b.kind === 'custom' ? 'Record the actual footprint and circuit arrangement from the panel labeling.' : 'Use the physical panel labeling to confirm the circuit.'}</p>
      ${b.circuits.map((c,i) => this._circuitMarkup(c,i)).join('')}</form>${edit ? `<div class="rail-footer"><button class="danger small" data-action="remove">Remove breaker</button><button class="primary" data-action="apply">Apply breaker</button></div>` : ''}</aside>`;
  }
  _panelMarkup() {
    const p = this._panel; const rows = Math.ceil(p.spaces / 2); const cells = []; const heights = Array(rows).fill(55);
    for (const b of p.breakers) {
      // Keep every compact circuit label and amp badge visible, including borders.
      const minimum = Math.ceil((b.circuits.length * 28 + 2 - (b.spaces - 1) * 6) / b.spaces);
      for (let r = Math.ceil(b.start / 2) - 1; r < Math.ceil(b.start / 2) - 1 + b.spaces; r++) heights[r] = Math.max(heights[r], minimum);
    }
    for (let start = 1; start <= p.spaces; start++) {
      const b = p.breakers.find(x => occupiedSpaces(x).includes(start));
      if (b && b.start !== start) continue;
      const row = Math.ceil(start / 2); const side = start % 2 ? 'left' : 'right'; const selected = this._draft?.id === b?.id;
      if (!b) cells.push(`<button class="breaker empty side-${side}" style="grid-row:${row}" data-action="slot" data-start="${start}" aria-label="Space ${start}, empty" ${!this._canEdit ? 'disabled' : ''}><span>${start} · Empty</span><span>${this._canEdit ? '+' : '—'}</span></button>`);
      else cells.push(`<button class="breaker ${b.kind} ${b.circuits.length > b.spaces ? 'compact' : ''} side-${side} ${selected ? 'selected' : ''}" style="grid-row:${row}/span ${b.spaces}" data-action="slot" data-start="${start}" aria-label="Spaces ${occupiedSpaces(b).join(', ')}, ${esc(b.circuits.map(c => `${c.name}, ${c.amps} amps`).join('; '))}"><span class="slot-number">${occupiedSpaces(b).join(' / ')}</span><span class="breaker-content">${b.circuits.map(c => {
        const a = c.assignments.find(a => a.role === 'circuit' && a.measurement === 'power') || c.assignments.find(a => a.role === 'circuit');
        return `<span class="breaker-circuit"><span class="dot ${a ? '' : 'unmonitored'}"></span><span class="circuit-label"><strong>${esc(c.name)}</strong><span class="reading" ${a ? `data-reading="${esc(a.entityId)}"` : ''}>${a ? esc(reading(this._hass?.states, a.entityId)) : 'No whole-circuit monitor'}</span></span><span class="amp">${c.amps}</span></span>`;
      }).join('')}</span></button>`);
    }
    return `<div class="panel-area"><div class="panel-caption"><span>Physical panel layout</span><span>${p.spaces} spaces · odd left / even right</span></div><div class="panel"><div class="panel-header"><div><strong>${esc(p.name)}</strong><small>${esc([p.location, p.manufacturer].filter(Boolean).join(' · ') || 'US panel · physical space numbering')}</small></div><span class="main-rating">${p.mainAmps} A <small>Main</small></span></div><div class="board" style="grid-template-rows:${heights.map(h => h + 'px').join(' ')}"><div class="bus" style="grid-row:1/span ${rows}" aria-hidden="true"></div>${cells.join('')}</div></div><div class="legend"><span><i class="dot"></i> Whole-circuit monitor</span><span><i class="dot unmonitored"></i> No whole-circuit monitor</span></div></div>`;
  }
  _modalMarkup() {
    if (!this._modal) return '';
    let body;
    if (this._modal.type === 'settings') {
      const p = this._modal.new ? newPanel('Main panel', 40, 'preview') : this._panel; const sizes = [8,12,16,20,24,30,40,42,54,60]; const preset = sizes.includes(p.spaces) ? String(p.spaces) : 'custom';
      body = `<h2>${this._modal.new ? 'Create a panel' : 'Panel settings'}</h2><form id="settings-form" onsubmit="return false">${field('Panel name', input('name', p.name, 'maxlength="80"'))}<div class="row">${field('Panel size', `<select name="preset">${options([...sizes.map(s => [String(s), `${s} spaces`]), ['custom','Custom size']], preset)}</select>`)}${field('Main breaker · amps', input('main', p.mainAmps, 'type="number" min="1" max="1000"'))}</div><div id="custom-size" class="${preset === 'custom' ? '' : 'hide'}">${field('Custom physical spaces', input('custom-spaces', p.spaces, 'type="number" min="1" max="120"'))}</div>${field('Location', input('location', p.location, 'maxlength="120" placeholder="e.g. Garage"'))}${field('Manufacturer / model', input('manufacturer', p.manufacturer, 'maxlength="120" placeholder="Optional"'))}</form><p class="help">Panel size counts physical spaces. Tandems may hold more circuits than spaces. Occupied spaces must fit before the panel can be reduced.</p>${!this._modal.new ? `<p class="help" style="margin-top:10px">Panel ID: ${esc(p.id)}</p><button class="danger small" style="margin-top:12px" data-action="delete-panel">Delete panel</button>` : ''}<div class="actions"><button data-action="modal-close">Cancel</button><button class="primary" data-action="save-settings">${this._modal.new ? 'Create panel' : 'Apply settings'}</button></div>`;
    } else {
      const plan = energyPlan(this._panel, this._hass.states);
      const energyCount = plan.filter(r => r.measurement === 'energy').length;
      const powerCount = plan.filter(r => r.measurement === 'power').length;
      body = `<h2>Panel, energy flow & history</h2><p class="smalltext muted">Your panel has <strong>${powerCount} primary power sensors</strong> and <strong>${energyCount} primary energy sensors</strong>. Power (W / kW) shows current demand; energy (Wh / kWh) records consumption over time.</p><p class="smalltext muted" style="margin-top:12px">Open <a href="/config/energy/electricity" target="_blank" rel="noopener">Energy configuration → Electricity</a>, then scroll to <strong>Individual electrical devices</strong>. You can also open Energy from the sidebar and use its configuration button. Sensors already configured there work with the exported Energy cards.</p><table class="plan" style="margin-top:15px"><thead><tr><th>Circuit / entity</th><th>Use</th></tr></thead><tbody>${plan.map(r => `<tr><td><strong>${esc(r.circuit)}</strong><br>${esc(r.entityId)}</td><td>${r.measurement === 'power' ? 'Power · live / history' : r.ready ? 'Energy · metadata ready' : 'Energy · check metadata'}</td></tr>`).join('') || '<tr><td colspan="2">No primary power or energy sensors assigned yet.</td></tr>'}</tbody></table><p class="help" style="margin-top:12px">For each power sensor, first look for an existing energy counter from the same channel. Assign it to the circuit as well if you want it in this checklist. Create an Integral helper only when no suitable energy counter exists. Energy metadata and recorded statistics are both required for Energy graphs.</p><p class="help" style="margin-top:12px"><strong>Export view YAML</strong> is one view to append to a dashboard’s <code>views:</code> list in its Raw configuration editor. <strong>Export new dashboard YAML</strong> includes that wrapper for a new dashboard. These are not Manual card configurations. The export includes an energy Sankey, usage graphs, your saved panel, and 24-hour history for assigned primary power sensors. The date selector controls Energy cards; panel readings and power history have their own time ranges.</p>${sharedEntities(this._panel).length ? `<p class="notice" style="margin:12px 0">Some primary entities are assigned to multiple circuits. Confirm their scope before adding individual-device entries.</p>` : ''}<div class="actions"><button data-action="energy-export">Export sensor checklist</button><button data-action="yaml">Export view YAML</button><button data-action="yaml-dashboard">Export new dashboard YAML</button><button class="primary" data-action="modal-close">Done</button></div>`;
    }
    return `<dialog aria-label="${this._modal.type === 'settings' ? 'Panel settings' : 'Energy dashboard setup'}">${body}<p id="modal-error" class="notice error hide" style="margin:15px 0 0"></p></dialog>`;
  }
  _updateLive() { for (const element of this.shadowRoot.querySelectorAll('[data-reading]')) element.textContent = reading(this._hass?.states, element.dataset.reading); }
  _render() {
    const p = this._panel; const summary = p ? panelSummary(p) : null; const edit = this._canEdit; const unsaved = this._dirty || this._editorDirty;
    this.shadowRoot.innerHTML = `<style>${styles}</style><div class="app"><header class="top"><div class="logo" aria-hidden="true">ϟ</div><div class="brand"><div class="eyebrow">Home Assistant · Circuit inventory</div><h1>Panel Builder</h1></div><span class="status">${this._busy ? 'Saving…' : unsaved ? 'Unsaved changes' : 'Layouts & circuit records'}</span>${p && edit ? `<button class="primary" data-action="save" ${this._busy ? 'disabled' : ''}>${this._busy ? 'Saving…' : 'Save panel'}</button>` : ''}</header>
      <div class="toolbar">${this._panels.length || p ? `<select id="panel-select" aria-label="Select panel">${!p ? '<option value="">Select a saved panel…</option>' : ''}${options([...this._panels.filter(x => x.id !== p?.id).map(x => [x.id,x.name]), ...(p ? [[p.id,p.name + (this._dirty ? ' · unsaved' : '')]] : [])], p?.id)}</select>` : ''}${edit ? '<button class="small" data-action="new">+ New panel</button>' : ''}<div class="spacer"></div>${p ? `${edit ? '<button class="small" data-action="settings">Panel settings</button>' : ''}<button class="small" data-action="energy">Energy setup</button><button class="small" data-action="export">Export JSON</button>` : ''}${edit ? '<button class="small" data-action="import">Import</button>' : ''}<button class="small" data-action="reload">Reload</button><input class="hide" id="import-file" type="file" accept=".json,application/json"></div>
      ${this._error ? `<div class="notice error" role="alert">${esc(this._error)}</div>` : ''}${this._message ? `<div class="notice ${this._message.kind}" role="status">${esc(this._message.text)}</div>` : ''}
      ${p ? `<div class="stats"><div class="stat"><strong>${summary.used}</strong><span>/ ${p.spaces}</span><small>PHYSICAL SPACES USED</small></div><div class="stat"><strong>${summary.circuits}</strong><small>NAMED CIRCUITS</small></div><div class="stat"><strong>${summary.monitored}</strong><span>/ ${summary.circuits}</span><small>WHOLE-CIRCUIT MONITORED</small></div></div>${sharedEntities(p).length ? `<div class="notice">A primary monitor is shared across circuits: ${esc(sharedEntities(p).join(', '))}. Check the coverage before using it in Energy accounting.</div>` : ''}<div class="workspace">${this._panelMarkup()}${this._railMarkup()}</div>` : `<div class="blank"><h2>${this._loading ? 'Loading your panels…' : 'Build a map of your power panel.'}</h2><p>Start with a common panel size or choose a custom number of spaces. Keep every circuit, monitor, and dated note together.</p>${edit && !this._loading ? '<button class="primary" data-action="new">Create your first panel</button>' : ''}${!edit && !this._loading ? '<p>An administrator can create and edit panels.</p>' : ''}</div>`}
      <footer class="footer"><span>${this._config.demo ? 'Local preview · simulated Home Assistant sensors' : edit ? 'Shared Home Assistant storage · administrator editing' : 'Shared Home Assistant storage · view only'}</span><span>v0.1.1</span></footer></div>${this._modalMarkup()}`;
    for (const form of this.shadowRoot.querySelectorAll('form')) { form.removeAttribute('onsubmit'); form.addEventListener('submit', e => e.preventDefault()); }
    if (this._busy) for (const control of this.shadowRoot.querySelectorAll('button,input,select,textarea')) control.disabled = true;
    const dialog = this.shadowRoot.querySelector('dialog');
    if (dialog && this.isConnected) { dialog.showModal(); dialog.addEventListener('cancel', () => { this._modal = null; }); }
  }
}
class PanelBuilderCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  setConfig(config) { this._config = config; this.render(); }
  set hass(hass) { this._hass = hass; }
  render() {
    this.shadowRoot.innerHTML = `<style>${styles}</style>${field('Panel ID (blank selects the first saved panel)', input('panel_id', this._config.panel_id || ''))}<label><input name="read_only" type="checkbox" ${this._config.read_only ? 'checked' : ''}> View only</label><p class="help">Create and edit panel layouts inside the card. Panel ID is available in Panel settings.</p>`;
    this.shadowRoot.onchange = e => {
      const config = { ...this._config, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim() };
      if (!config.panel_id) delete config.panel_id;
      this._config = config; this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    };
  }
}
if (!customElements.get('panel-builder-card')) customElements.define('panel-builder-card', PanelBuilderCard);
if (!customElements.get('panel-builder-card-editor')) customElements.define('panel-builder-card-editor', PanelBuilderCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'panel-builder-card')) window.customCards.push({ type: 'panel-builder-card', name: 'Panel Builder', description: 'Visual electric panel, circuits, Home Assistant monitors, and dated notes.', preview: true });
