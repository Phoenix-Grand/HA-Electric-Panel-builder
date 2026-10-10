import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePanel, occupiedSpaces, putBreaker, resizePanel, newBreaker, panelSummary, energyPlan, energyEligible, sharedEntities, dashboardYaml } from '../custom_components/panel_builder/frontend/model.js';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/panel.json', import.meta.url)));
test('a 60A two-pole breaker uses adjacent rows on one side, and a tandem has independent circuits', () => {
  const p = validatePanel(fixture());
  assert.deepEqual(occupiedSpaces(p.breakers[0]), [1,3]);
  assert.equal(p.breakers[0].circuits[0].amps, 60);
  assert.deepEqual(occupiedSpaces(p.breakers[1]), [2]);
  assert.deepEqual(p.breakers[1].circuits.map(c => c.amps), [20,20]);
  assert.deepEqual(panelSummary(p), { used: 3, circuits: 3, monitored: 1 });
});
test('overlap, end-of-column overflow, and unsafe shrinking are rejected without changing the panel', () => {
  const p = fixture(); const original = JSON.stringify(p);
  const collision = newBreaker(3); collision.circuits[0].name = 'Collision';
  assert.throws(() => putBreaker(p, collision), /already occupied/);
  const beyond = newBreaker(8,'double'); beyond.circuits[0].name = 'Beyond';
  assert.throws(() => putBreaker(p, beyond), /past the panel/);
  assert.throws(() => resizePanel(p, 2), /past the panel/);
  assert.equal(JSON.stringify(p), original);
});
test('editing a breaker can move it without colliding with its original footprint', () => {
  const p = fixture(); const b = structuredClone(p.breakers[0]); b.start = 5;
  const moved = putBreaker(p,b); assert.deepEqual(occupiedSpaces(moved.breakers[1]), [5,7]);
  assert.equal(moved.breakers.length,2); assert.equal(p.breakers[0].start,1);
});
test('custom and odd-sized panels allow valid custom footprints and reject malformed shapes', () => {
  const p = fixture(); p.spaces = 9; const b = newBreaker(9); b.circuits[0].name = 'Final left space';
  assert.equal(putBreaker(p,b).breakers.length,3);
  b.kind = 'custom'; b.start=4; b.spaces=3;
  assert.deepEqual(occupiedSpaces(b),[4,6,8]); assert.equal(putBreaker(p,b).breakers.length,3);
  p.breakers[1].spaces=2; assert.throws(() => validatePanel(p), /do not match/);
});
test('imports reject duplicate identities, invalid dates, future versions, and invalid ratings', () => {
  const p=fixture(); p.breakers[1].id=p.breakers[0].id; assert.throws(()=>validatePanel(p), /unique/);
  const date=fixture(); date.breakers[0].circuits[0].notes[0].date='2026-02-30'; assert.throws(()=>validatePanel(date),/valid date/);
  const version=fixture(); version.version=2; assert.throws(()=>validatePanel(version),/Unsupported/);
  const amps=fixture(); amps.breakers[0].circuits[0].amps=0; assert.throws(()=>validatePanel(amps),/amp rating/);
});
test('energy planning excludes comparison and device monitors, and requires suitable metadata', () => {
  const p=fixture(); const c=p.breakers[0].circuits[0];
  c.assignments.push({id:'comparison',entityId:'sensor.comparison_energy',role:'comparison',measurement:'energy',deviceId:'',label:''}, {id:'plug',entityId:'sensor.plug_energy',role:'device',measurement:'energy',deviceId:'',label:''});
  validatePanel(p);
  const state={state:'42',attributes:{device_class:'energy',unit_of_measurement:'kWh',state_class:'total_increasing'}};
  const plan=energyPlan(p,{'sensor.heat_pump_energy':state}); assert.equal(plan.length,1); assert.equal(plan[0].ready,true);
  assert.equal(energyEligible({...state,attributes:{...state.attributes,state_class:'measurement'}}),false);
  assert.equal(energyEligible({...state,attributes:{...state.attributes,unit_of_measurement:'W'}}),false);
  assert.equal(energyPlan(p,{})[0].ready,false);
});
test('one primary measurement per circuit; shared entities across circuits are flagged and deduplicated', () => {
  const p=fixture(); const c=p.breakers[0].circuits[0];
  c.assignments.push({...c.assignments[0],id:'primary2',entityId:'sensor.other_energy'});
  assert.throws(()=>validatePanel(p),/one primary/);
  c.assignments.pop(); p.breakers[1].circuits[0].assignments.push({...c.assignments[0],id:'shared'}); validatePanel(p);
  assert.deepEqual(sharedEntities(p),['sensor.heat_pump_energy']); assert.equal(energyPlan(p,{}).length,1);
});
test('dashboard export quotes user-supplied YAML text and retains the panel ID',()=>{
  const p=fixture(); p.name='Garage: "panel"\nnext'; const yaml=dashboardYaml(p);
  assert.ok(yaml.includes('title: "Garage: \\"panel\\"\\nnext"')); assert.ok(yaml.includes('panel_id: "test-panel"'));
});

test('power-only assignments appear in the checklist without being marked Energy-ready',()=>{
  const p=fixture();
  p.breakers[0].circuits[0].assignments[0].measurement='power';
  p.breakers[0].circuits[0].assignments[0].entityId='sensor.heat_pump_power';
  const plan=energyPlan(p, {'sensor.heat_pump_power': {state:'1200',attributes:{device_class:'power',unit_of_measurement:'W',state_class:'measurement'}}});
  assert.equal(plan.length,1); assert.equal(plan[0].measurement,'power'); assert.equal(plan[0].ready,false);
});

test('dashboard exports share a date collection and include deduplicated primary power history',()=>{
  const p=fixture(); const circuit=p.breakers[0].circuits[0];
  circuit.assignments.push({id:'power1',entityId:'sensor.heat_pump_power',role:'circuit',measurement:'power',deviceId:'',label:''});
  p.breakers[1].circuits[0].assignments.push({...circuit.assignments[1],id:'power2'});
  p.breakers[1].circuits[1].assignments.push({...circuit.assignments[1],id:'comparison-power',entityId:'sensor.comparison_power',role:'comparison'});
  validatePanel(p);
  const view=dashboardYaml(p); const full=dashboardYaml(p,true);
  assert.ok(view.includes('type: energy-sankey'));
  assert.equal((view.match(/collection_key: "energy_panel_test-panel"/g)||[]).length,4);
  assert.ok(view.includes('hours_to_show: 24'));
  assert.equal((view.match(/entity: "sensor.heat_pump_power"/g)||[]).length,1);
  assert.ok(!view.includes('sensor.comparison_power'));
  assert.ok(view.includes('read_only: true'));
  assert.ok(view.includes('path: "panel-energy-test-panel"'));
  assert.ok(full.includes('views:\n  - title:'));
  assert.ok(full.includes('\n    cards:\n      - type: vertical-stack'));
});
