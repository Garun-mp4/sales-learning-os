/** No npm dependency required. Verifies pre-Astro content staging and route metadata. */
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const manifest = JSON.parse(await readFile('src/generated/content-manifest.json', 'utf8'));
const entries = Object.values(manifest.entries);
assert.equal(entries.length, 430, 'Expected 430 documents');
for (const [kind, size] of [['module',22], ['theory',336], ['practice',72]])
  assert.equal(entries.filter(e=>e.kind===kind).length,size,kind);
for (const entry of entries) {
  const original = await readFile(path.join('sales-knowledge-base',entry.path));
  const copied = await readFile(path.join('src/content/sales',entry.path.replace(/^modules\//,'')));
  assert.equal(createHash('sha256').update(original).digest('hex'),createHash('sha256').update(copied).digest('hex'), 'Markdown source sync mismatch: '+entry.id);
  assert.ok(entry.path.endsWith('.md'),entry.id);
}
const finalPage = await readFile('src/pages/final-project/index.astro', 'utf8');
assert.ok(finalPage.includes('src/generated/final-project.html'), 'Final project must read durable staged HTML');
assert.ok(!finalPage.includes("readFile(path.resolve('dist/"),'Final project must not depend on disposable dist output');
const staged = await readFile('src/generated/final-project.html','utf8');
assert.ok(staged.length > 1000 && staged.includes('Чек-пойнты'), 'Final project Markdown article is not staged');
const routes=await readdir('src/pages');
assert.ok(routes.includes('final-project'));
console.log('PASS: 430 Astro content copies identical to original Markdown; staged final project independent of dist');
