import { mkdir, readdir, copyFile, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const cwd=process.cwd();
const source=path.join(cwd,'sales-knowledge-base','modules');
const dest=path.join(cwd,'src','content','sales');
await rm(dest,{recursive:true,force:true});
async function traverse(src,dst){await mkdir(dst,{recursive:true});for(const d of await readdir(src,{withFileTypes:true})){const a=path.join(src,d.name),b=path.join(dst,d.name);if(d.isDirectory())await traverse(a,b);else if(d.name.endsWith('.md'))await copyFile(a,b);}}
await traverse(source,dest);
await mkdir('public/assets',{recursive:true});
for(const [a,b] of [
 ['src/styles/app.css','public/assets/app.css'],['src/scripts/app.js','public/assets/app.js'],
 ['src/generated/client-index.json','public/assets/client-index.json'],
 ['dist/assets/search-index.json','public/assets/search-index.json'],
 ['dist/assets/offline-files.json','public/assets/offline-files.json'],
 ['dist/assets/favicon.svg','public/assets/favicon.svg'],
 ['dist/sw.js','public/sw.js'],['dist/manifest.webmanifest','public/manifest.webmanifest']
])await copyFile(a,b);
// Astro may clear dist/ at the start of its build. Stage the Python-rendered
// final project *outside* dist/ so the Astro page never depends on an output
// file that can disappear mid-build. The Python Markdown renderer disables raw HTML.
const fullFinalProject = await readFile('dist/final-project/index.html', 'utf8');
const finalProjectArticle = fullFinalProject.match(/<div class="article" data-pagefind-body>([\s\S]*?)<\/div>/)?.[1];
if (!finalProjectArticle?.trim()) throw new Error('Final project article missing from static prebuild');
await mkdir('src/generated', {recursive:true});
await writeFile('src/generated/final-project.html', finalProjectArticle, 'utf8');
console.log('Synced 430 Markdown documents, final project snapshot and progressive-enhancement assets');
