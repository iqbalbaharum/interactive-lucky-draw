import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/flocking.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText;
const { FlockSimulation } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const make = (count = 600) => new FlockSimulation(count, 768, 400, 42);

const normal = make(); const fast = make();
const start = performance.now();
for (let i = 1; i <= 150; i++) normal.advanceTo(i / 60);
const runtime = performance.now() - start;
for (let i = 1; i <= 360; i++) fast.advanceTo(i / 144);
assert.deepEqual(normal.birds, fast.birds, 'Refresh rate must not affect simulation');
assert.equal(normal.birds.length, 600);
for (const bird of normal.birds) {
  assert.ok(Number.isFinite(bird.x + bird.y + bird.heading));
  assert.ok(bird.x >= 0 && bird.x < 768 && bird.y >= 0 && bird.y < 376);
}
const lone = make(1); lone.advanceTo(1);
Object.assign(lone.birds[0], { x: 767.9, y: 100, heading: 0, speed: 180 });
lone.advanceTo(1 + 1 / 60);
assert.ok(lone.birds[0].x < 5, 'Bird should wrap across the right edge');
assert.ok(Math.abs(lone.birds[0].heading) <= Math.PI / 40 + 1e-9, 'Turns are bounded');
const pair = make(2); pair.advanceTo(1);
Object.assign(pair.birds[0], { x: 100, y: 100, heading: 0 });
Object.assign(pair.birds[1], { x: 125, y: 125, heading: Math.PI / 4 });
pair.advanceTo(1 + 1 / 60);
assert.ok(pair.birds[0].heading > 0, 'Bird turns toward its nearest neighbor');
const shot = structuredClone(normal.birds); normal.advanceTo(4);
assert.deepEqual(normal.birds, shot, 'Shot retains the exact final flight positions');
assert.deepEqual(make(0).advanceTo(2.5), []);
console.log(`Flocking checks passed: 600 birds, fixed-step recovery, smooth turning, nearest-neighbor steering, wrapping, empty/single flocks, and shot continuity. ${runtime.toFixed(0)}ms for 150 simulation steps.`);
