import '../custom_components/panel_builder/frontend/panel-builder.js';
import { clone, newPanel, newBreaker, id, validatePanel, sensorMeasurement } from '../custom_components/panel_builder/frontend/model.js';
const KEY = 'panel-builder-demo-v1';
const sensors = {};
const catalog = [];
const sample = newPanel('Main panel', 40, 'main-panel'); sample.location = 'Garage'; sample.manufacturer = 'Example panel';
function addMonitor(circuit, key, device, watts, energy) {
  for (const [measurement, value, unit, stateClass] of [['power', watts, 'W', 'measurement'], ['energy', energy, 'kWh', 'total_increasing']]) {
    const entityId = `sensor.${key}_${measurement}`;
    sensors[entityId] = { entity_id: entityId, state: String(value), attributes: { friendly_name: `${circuit.name} ${measurement}`, device_class: measurement, unit_of_measurement: unit, state_class: stateClass } };
    catalog.push({ entityId, name: `${circuit.name} ${measurement}`, deviceId: key, deviceName: device, measurement });
    circuit.assignments.push({ id: id(), entityId, deviceId: key, label: device, role: 'circuit', measurement });
  }
}
function breaker(start, kind, circuits) {
  const b = newBreaker(start, kind);
  circuits.forEach(([name, amps, key, watts, energy], i) => {
    const c = b.circuits[i]; Object.assign(c, { name, amps, verifiedOn: '2026-10-09' });
    if (key) addMonitor(c, key, 'Example circuit monitor', watts, energy);
  }); sample.breakers.push(b); return b;
}
const hvac = breaker(1, 'double', [['Heat pump', 60, 'heat_pump', 2840, 438.72]]);
hvac.circuits[0].notes.push({ id: id(), date: '2026-10-09', text: 'Example note: confirmed outdoor unit and air handler labeling. This is a simulated circuit, not your panel data.' });
breaker(2, 'double', [['Water heater', 30, 'water_heater', 0, 174.18]]);
breaker(5, 'tandem', [['Kitchen outlets', 20, 'kitchen', 146, 92.14], ['Dining outlets', 20, null]]);
breaker(6, 'single', [['Home office', 20, 'office', 212, 48.33]]);
breaker(7, 'single', [['Downstairs lights', 15, null]]);
breaker(8, 'single', [['Laundry', 20, 'laundry', 4, 57.68]]);
breaker(9, 'single', [['Refrigerator', 20, 'fridge', 84, 64.9]]);
breaker(10, 'double', [['EV charger', 50, 'ev', 0, 310.61]]);
breaker(11, 'single', [['Garage outlets', 20, null]]);
breaker(14, 'quad', [['Dryer', 30, 'dryer', 0, 87.21], ['Workshop', 20, null]]);
sample.breakers.sort((a,b) => a.start - b.start); sample.revision = 1; sample.updatedAt = '2026-10-09T18:00:00Z';
validatePanel(sample);
const plug = 'sensor.freezer_plug_power';
sensors[plug] = { entity_id: plug, state: '62', attributes: { friendly_name: 'Freezer plug power', device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' } };
catalog.push({ entityId: plug, name: 'Freezer plug power', deviceId: 'freezer-plug', deviceName: 'Example smart plug', measurement: 'power' });
const card = document.querySelector('panel-builder-card');
const user = { is_admin: new URLSearchParams(location.search).get('readonly') !== '1', name: 'Preview user' };
function getPanels() {
  const saved = localStorage.getItem(KEY);
  return saved === null ? [clone(sample)] : JSON.parse(saved);
}
const demo = {
  failSave: false,
  async callWS(msg) {
    if (msg.type === 'panel_builder/list') return { panels: getPanels() };
    if (msg.type === 'panel_builder/monitors') return { entities: clone(catalog) };
    if (!user.is_admin) throw { code: 'unauthorized', message: 'Administrator access is required' };
    if (msg.type === 'panel_builder/save') {
      if (demo.failSave) throw { code: 'save_failed', message: 'Simulated storage failure' };
      const panel = clone(validatePanel(msg.panel)); const panels = getPanels(); const old = panels.find(p => p.id === panel.id);
      if (panel.revision !== (old?.revision || 0)) throw { code: 'conflict', message: 'Another session changed this panel' };
      panel.revision++; panel.updatedAt = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify([...panels.filter(p => p.id !== panel.id), panel])); return clone(panel);
    }
    if (msg.type === 'panel_builder/delete') {
      const panels = getPanels(); const old = panels.find(p => p.id === msg.panel_id);
      if (!old || old.revision !== msg.revision) throw { code: 'conflict', message: 'Panel changed or deleted' };
      localStorage.setItem(KEY, JSON.stringify(panels.filter(p => p.id !== msg.panel_id))); return {};
    }
    throw new Error(`Unknown preview command: ${msg.type}`);
  },
  getPanels,
  sensors,
  card,
};
window.panelBuilderDemo = demo;
card.setConfig({ type: 'custom:panel-builder-card', demo: true });
card.hass = { states: sensors, user, callWS: msg => demo.callWS(msg) };
setInterval(() => { card.hass = { states: sensors, user, callWS: msg => demo.callWS(msg) }; }, 5000);
document.querySelector('#reset-demo').addEventListener('click', () => {
  if (confirm('Reset the preview to the example panel? This removes panel changes saved in this browser.')) { localStorage.removeItem(KEY); location.reload(); }
});
card.addEventListener('hass-more-info', event => {
  const state = sensors[event.detail.entityId];
  alert(`${state?.attributes.friendly_name || event.detail.entityId}\n${state?.state || 'Unavailable'} ${state?.attributes.unit_of_measurement || ''}\n\nIn Home Assistant this opens the real entity history and details.`);
});
