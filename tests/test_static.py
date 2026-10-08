#!/usr/bin/env python3
"""Deterministic structural/content checks for full static output."""
import json,pathlib,re,collections,sys
from bs4 import BeautifulSoup
ROOT=pathlib.Path(__file__).resolve().parents[1];DIST=ROOT/'dist';manifest=json.loads((ROOT/'src/generated/content-manifest.json').read_text(encoding='utf8'));entries=manifest['entries'];issues=[];links=0
html_files=list(DIST.rglob('*.html'))
expected={f'{kind}/{id}/index.html' for id,e in entries.items() for kind in [{'theory':'lesson','practice':'practice','module':'module'}[e['kind']]]}
for rel in expected:
 if not (DIST/rel).is_file():issues.append('Missing '+rel)
for path in html_files:
 soup=BeautifulSoup(path.read_text(encoding='utf8'),'html.parser');name=str(path.relative_to(DIST));root=path.parent
 if not soup.select_one('html[lang="ru"]'):issues.append('Missing lang '+name)
 if not soup.select_one('main#main'):issues.append('Missing main '+name)
 for a in soup.select('a[href]'):
  url=a.get('href','');links+=1
  if url.startswith(('http://','https://','mailto:','#')):continue
  bare=url.split('#',1)[0].split('?',1)[0]
  if not bare:continue
  # Python fallback uses relative links; Astro uses root-absolute links.
  # Resolve both forms inside dist/ rather than interpreting '/lesson/...'
  # as an operating-system path outside the website.
  target=((DIST/bare.lstrip('/')) if bare.startswith('/') else (root/bare)).resolve()
  if not target.is_relative_to(DIST.resolve()):issues.append('Escaping href '+name+' '+url);continue
  if target.is_dir():target=target/'index.html'
  if not target.exists():issues.append('Broken href '+name+' '+url)
 for a in soup.select('a[href^="#"]'):
  frag=a.get('href')[1:]
  if frag and not soup.find(id=frag):issues.append('Broken anchor '+name+' '+frag)
 if name.startswith('lesson/') or re.match(r'^practice/\d{2}-P\d{2}/index.html$',name):
  if not soup.select_one('.article'):issues.append('Missing article '+name)
  if not soup.select_one('[data-status-control]'):issues.append('Missing status '+name)
  if not soup.select_one('[data-note]'):issues.append('Missing notes '+name)
 if name.startswith('module/'):
  mod=re.match(r'module/(\d{2})-MODULE/index.html',name)
  if mod:
   expected_count=sum(e['module']==mod.group(1) and e['kind']!='module' for e in entries.values())
   observed=len(soup.select('main .item'))
   if expected_count!=observed:issues.append(f'Module leakage/count {name}: {observed}/{expected_count}')
if not (DIST/'final-project/index.html').is_file() or not (DIST/'final-project/index.html').read_text(encoding='utf8').count('data-note="FINAL_PROJECT"'):
 issues.append('Missing final project editable notes')
for id,e in entries.items():
 if e['kind']=='theory':
  soup=BeautifulSoup((DIST/'lesson'/id/'index.html').read_text(encoding='utf8'),'html.parser')
  if 'Редакционный черновик' not in soup.text:issues.append('Missing editorial label '+id)
  if e['title'] not in soup.text:issues.append('Missing title '+id)
page_indexes=json.loads((DIST/'assets/search-index.json').read_text(encoding='utf8'))
if len(page_indexes)!=430:issues.append('Search count mismatch')
if len(html_files)!=476:issues.append('Unexpected page count '+str(len(html_files)))
for issue in issues[:30]:print('ERROR',issue)
print(f'CHECK: {len(html_files)} pages, {len(expected)} primary documents, {links} hrefs, {len(page_indexes)} indexed, {len(issues)} issues')
if issues:raise SystemExit(1)
