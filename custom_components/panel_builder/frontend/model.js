export const VERSION = 1;
export const KINDS = {
  single: { label: 'Single pole', spaces: 1, circuits: 1 },
  double: { label: 'Two pole', spaces: 2, circuits: 1 },
  triple: { label: 'Three pole', spaces: 3, circuits: 1 },
  tandem: { label: 'Tandem · 2 circuits / 1 space', spaces: 1, circuits: 2 },
  quad: { label: 'Quad · 2 circuits / 2 spaces', spaces: 2, circuits: 2 },
  custom: { label: 'Custom footprint', spaces: 1, circuits: 1 },
};
export const id = () => globalThis.crypto.randomUUID();
export const clone = value => JSON.parse(JSON.stringify(value));
export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function newPanel(name = 'Main panel', spaces = 40, panelId = id()) {
  return { version: VERSION, id: panelId, name, spaces, mainAmps: 200, location: '', manufacturer: '', revision: 0, updatedAt: '', breakers: [] };
}
export function newCircuit() {
  return { id: id(), name: '', amps: 20, verifiedOn: '', assignments: [], notes: [] };
}
export function newBreaker(start, kind = 'single') {
  const shape = KINDS[kind];
  return { id: id(), start, kind, spaces: shape.spaces, circuits: Array.from({ length: shape.circuits }, newCircuit) };
}
export const occupiedSpaces = breaker => Array.from({ length: breaker.spaces }, (_, i) => breaker.start + i * 2);
function fail(message) { throw new Error(message); }
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be a whole number from ${min} to ${max}.`);
}
function string(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${label} is required and must be at most ${max} characters.`);
}
function date(value, label) {
  if (!value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(`${label} must be a valid date.`);
}
export function validatePanel(panel) {
  if (!panel || typeof panel !== 'object' || Array.isArray(panel)) fail('Choose a panel JSON file.');
  if (panel.version !== VERSION) fail('Unsupported panel version. Update Panel Builder before importing.');
  const ids = new Set();
  const checkId = (value, label) => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value) || ids.has(value)) fail(`${label} must have a unique, valid ID.`);
    ids.add(value);
  };
  checkId(panel.id, 'Panel');
  string(panel.name, 80, 'Panel name', true);
  string(panel.location, 120, 'Location');
  string(panel.manufacturer, 120, 'Manufacturer');
  integer(panel.spaces, 1, 120, 'Panel spaces');
  integer(panel.mainAmps, 1, 1000, 'Main breaker rating');
  integer(panel.revision, 0, Number.MAX_SAFE_INTEGER, 'Revision');
  string(panel.updatedAt, 40, 'Updated timestamp');
  if (!Array.isArray(panel.breakers) || panel.breakers.length > 120) fail('Invalid breaker list.');
  const taken = new Set();
  for (const breaker of panel.breakers) {
    checkId(breaker.id, 'Breaker');
    if (!Object.hasOwn(KINDS, breaker.kind)) fail('Unknown breaker type.');
    integer(breaker.start, 1, panel.spaces, 'Starting space');
    integer(breaker.spaces, 1, 6, 'Breaker footprint');
    const shape = KINDS[breaker.kind];
    if (!Array.isArray(breaker.circuits) || breaker.circuits.length < 1 || breaker.circuits.length > 6) fail('A breaker needs 1–6 circuits.');
    if (breaker.kind !== 'custom' && (breaker.spaces !== shape.spaces || breaker.circuits.length !== shape.circuits)) fail('Breaker type and footprint do not match.');
    for (const slot of occupiedSpaces(breaker)) {
      if (slot > panel.spaces) fail(`Breaker at space ${breaker.start} extends past the panel.`);
      if (taken.has(slot)) fail(`Space ${slot} is already occupied. Move or remove the other breaker first.`);
      taken.add(slot);
    }
    for (const circuit of breaker.circuits) {
      checkId(circuit.id, 'Circuit');
      string(circuit.name, 100, 'Circuit name', true);
      integer(circuit.amps, 1, 1000, 'Circuit amp rating');
      string(circuit.verifiedOn, 10, 'Verification date');
      date(circuit.verifiedOn, 'Verification date');
      if (!Array.isArray(circuit.notes) || circuit.notes.length > 100) fail('Each circuit allows up to 100 notes.');
      for (const note of circuit.notes) {
        checkId(note.id, 'Note');
        string(note.text, 4000, 'Note', true);
        string(note.date, 10, 'Note date', true);
        date(note.date, 'Note date');
      }
      if (!Array.isArray(circuit.assignments) || circuit.assignments.length > 30) fail('Each circuit allows up to 30 monitor assignments.');
      const entities = new Set();
      const primaryClasses = new Set();
      for (const assignment of circuit.assignments) {
        checkId(assignment.id, 'Assignment');
        if (!/^sensor\.[a-z0-9_]+$/.test(assignment.entityId)) fail('Choose a sensor entity ID, such as sensor.kitchen_energy.');
        if (entities.has(assignment.entityId)) fail('This entity is already assigned to this circuit.');
        entities.add(assignment.entityId);
        if (!['circuit', 'comparison', 'device'].includes(assignment.role)) fail('Unknown monitor role.');
        if (!['power', 'energy', 'current'].includes(assignment.measurement)) fail('Choose power, energy, or current.');
        if (assignment.role === 'circuit') {
          if (primaryClasses.has(assignment.measurement)) fail('Use one primary whole-circuit sensor per measurement. Mark additional meters as comparison.');
          primaryClasses.add(assignment.measurement);
        }
        string(assignment.label, 120, 'Monitor label');
        string(assignment.deviceId, 64, 'Device ID');
      }
    }
  }
  return panel;
}
export function putBreaker(panel, breaker) {
  const candidate = clone(panel);
  candidate.breakers = candidate.breakers.filter(item => item.id !== breaker.id);
  candidate.breakers.push(clone(breaker));
  candidate.breakers.sort((a, b) => a.start - b.start);
  return validatePanel(candidate);
}
export function resizePanel(panel, spaces) {
  const candidate = clone(panel);
  candidate.spaces = spaces;
  return validatePanel(candidate);
}
export function sensorMeasurement(state) {
  const a = state?.attributes || {};
  if (['energy', 'power', 'current'].includes(a.device_class)) return a.device_class;
  if (['Wh', 'kWh', 'MWh', 'GWh', 'J', 'kJ', 'MJ', 'GJ'].includes(a.unit_of_measurement)) return 'energy';
  if (['W', 'kW', 'MW'].includes(a.unit_of_measurement)) return 'power';
  if (['A', 'mA'].includes(a.unit_of_measurement)) return 'current';
  return null;
}
export function energyEligible(state) {
  const a = state?.attributes || {};
  return a.device_class === 'energy' && ['Wh', 'kWh', 'MWh', 'GWh', 'J', 'kJ', 'MJ', 'GJ'].includes(a.unit_of_measurement) && ['total', 'total_increasing'].includes(a.state_class);
}
export function panelSummary(panel) {
  const circuits = panel.breakers.flatMap(b => b.circuits);
  return { used: panel.breakers.reduce((n, b) => n + b.spaces, 0), circuits: circuits.length, monitored: circuits.filter(c => c.assignments.some(a => a.role === 'circuit')).length };
}
export function sharedEntities(panel) {
  const counts = new Map();
  for (const circuit of panel.breakers.flatMap(b => b.circuits)) {
    for (const a of circuit.assignments.filter(a => a.role === 'circuit')) counts.set(a.entityId, (counts.get(a.entityId) || 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([entity]) => entity);
}
export function energyPlan(panel, states) {
  const rows = [];
  const seen = new Set();
  for (const breaker of panel.breakers) for (const circuit of breaker.circuits) {
    for (const assignment of circuit.assignments.filter(a => a.role === 'circuit' && a.measurement === 'energy')) {
      if (seen.has(assignment.entityId)) continue;
      seen.add(assignment.entityId);
      rows.push({ circuit: circuit.name, spaces: occupiedSpaces(breaker), entityId: assignment.entityId, ready: energyEligible(states[assignment.entityId]) });
    }
  }
  return rows;
}
export function dashboardYaml(panel) {
  return `# Add this view to an editable Home Assistant dashboard.\n# Register /panel_builder/panel-builder.js?v=0.1.0 as a JavaScript module.\n# Built-in Energy cards use the sensors configured in Settings > Energy.\ntitle: ${JSON.stringify(panel.name)}\npath: panel-energy\ncards:\n  - type: energy-date-selection\n  - type: energy-usage-graph\n  - type: energy-devices-graph\n  - type: custom:panel-builder-card\n    panel_id: ${JSON.stringify(panel.id)}\n`;
}
