#!/usr/bin/env python3
"""Reproducible offline static build of Sales OS using packaged Python libraries.
The full Markdown corpus is preserved as source and rendered into separate HTML pages.
"""
from __future__ import annotations
import collections, datetime, hashlib, html, json, os, pathlib, re, shutil, textwrap, unicodedata
from urllib.parse import urlparse, unquote
import yaml
from markdown_it import MarkdownIt
from bs4 import BeautifulSoup
from jinja2 import Environment, BaseLoader, select_autoescape

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'dist';CONTENT=ROOT/'sales-knowledge-base';SOURCE=json.loads((ROOT/'src/generated/content-manifest.json').read_text(encoding='utf-8'))
ENTRIES=SOURCE['entries']; STAGES=SOURCE['stages']; SOURCES=SOURCE['sources']
STAGE_GROUPS={s['id']:[] for s in STAGES}
for k,e in ENTRIES.items():
 if e['kind']=='module':STAGE_GROUPS[e['stage']].append(e)
for group in STAGE_GROUPS.values():group.sort(key=lambda e:e['module'])
BYMOD=collections.defaultdict(list)
for e in ENTRIES.values():BYMOD[e['module']].append(e)
for group in BYMOD.values():group.sort(key=lambda e:(0 if e['kind']=='module' else 1 if e['kind']=='theory' else 2,e.get('order',0)))

TEMPLATE=Environment(loader=BaseLoader(),autoescape=select_autoescape(default=True))
# Inline icon symbols: SVG is inert, presentation only; buttons live in regular HTML.
ICONS={
 'dashboard':'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 'map':'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
 'book':'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
 'check':'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
 'library':'<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="18" rx="1"/><path d="m17 4 4 1 0 15-4-1z"/>',
 'star':'<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
 'settings':'<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2 2-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21h-2.8v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06-2-2 .06-.06A1.65 1.65 0 0 0 7.6 15a1.65 1.65 0 0 0-1.51-1H6v-2.8h.09a1.65 1.65 0 0 0 1.51-1A1.65 1.65 0 0 0 7.27 8.4l-.06-.06 2-2 .06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V5h2.8v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 2 2-.06.06A1.65 1.65 0 0 0 19.4 10a1.65 1.65 0 0 0 1.51 1H21v2.8h-.09A1.65 1.65 0 0 0 19.4 15z"/>',
 'search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
 'chevron':'<path d="m9 18 6-6-6-6"/>',
 'arrow':'<path d="m5 12 14 0m-6-6 6 6-6 6"/>',
 'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
 'menu':'<path d="M4 6h16M4 12h16M4 18h16"/>',
 'download':'<path d="M12 3v12m-4-4 4 4 4-4M5 18v3h14v-3"/>',
 'folder':'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/>',
 'clock':'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
}
def icon(name):return '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICONS.get(name,ICONS['arrow'])+'</svg>'
def h(s):return html.escape(str(s),quote=True)
def route(e):return f"{ {'module':'module','theory':'lesson','practice':'practice'}[e['kind']]}/{e['id']}/"
def link(path,depth):return '../'*depth+path

def md_html(e,depth):
 path=CONTENT/e['path'];raw=path.read_text(encoding='utf-8');body=raw.split('---',2)[2].strip()
 md=MarkdownIt('default',{'html':False,'linkify':False,'typographer':True}).enable('table').enable('strikethrough')
 markup=md.render(body)
 soup=BeautifulSoup(markup,'html.parser')
 toc=[];anchors=collections.Counter()
 for head in soup.find_all(['h2','h3']):
  label=head.get_text(' ',strip=True);slug=slugify(label);anchors[slug]+=1
  if anchors[slug]>1:slug=f'{slug}-{anchors[slug]}'
  head['id']=slug;toc.append((label,slug,head.name))
 for a in soup.select('a[href]'):
  href=a.get('href','')
  if href.startswith(('http://','https://')):
   a['rel']='noopener noreferrer';a['target']='_blank'
  elif href.endswith('.md') or '.md#' in href:
   filepart,_,anchor=href.partition('#');target=(path.parent/filepart).resolve()
   if target.is_relative_to(CONTENT.resolve()):
    relative=str(target.relative_to(CONTENT.resolve()))
    candidate=next((x for x in ENTRIES.values() if x['path']==relative),None)
    if candidate:a['href']=link(route(candidate),depth)+('#'+anchor if anchor else '')
    else:a['href']=link('sources/',depth)
  elif href.startswith(('javascript:','data:')):a['href']='#'
 for t in soup.select('table'):t.wrap(soup.new_tag('div',attrs={'class':'table-wrap'}))
 return str(soup),toc

def slugify(value):
 value=unicodedata.normalize('NFKC',value.lower());value=re.sub(r'[^\w\-\s]+','',value,flags=re.UNICODE);return re.sub(r'\s+','-',value).strip('-') or 'section'

def page_shell(body,title,depth,active='',doc=None):
 p=lambda x:link(x,depth)
 current=active;mod=doc.get('module') if doc else None
 nav_top=[('dashboard','Обзор','', 'home'),('map','Roadmap','roadmap/','roadmap'),('check','Практика','practice/','practice'),('search','Поиск','search/','search'),('library','Источники','sources/','sources'),('star','Закладки','bookmarks/','bookmarks')]
 nav=''.join(f'<a class="nav-item {"active" if active==a else ""}" href="{p(url)}" {"aria-current=\"page\"" if active==a else ""} title="{h(label)}">{icon(ic)}<span>{h(label)}</span></a>' for ic,label,url,a in nav_top)
 groups=''
 for s in STAGES:
  links=''.join(f'<a class="nav-item {"active" if mod==e["module"] else ""}" href="{p(route(e))}" title="{h(e["title"])}"><span class="label-number">{e["module"]}</span><span>{h(e["title"])}</span></a>' for e in STAGE_GROUPS[s['id']])
  selected=any(e['module']==mod for e in STAGE_GROUPS[s['id']]);
  groups+=f'<details class="nav-group" {"open" if selected else ""}><summary><span class="num">0{s["id"]}</span><span>{h(s["title"])}</span><span class="arr">›</span></summary><div class="nav-sub">{links}</div></details>'
 css=p('assets/app.css');js=p('assets/app.js')
 return f'''<!doctype html><html lang="ru" data-root="{p('')}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="theme-color" content="#ffffff"/><meta name="description" content="Sales OS — самостоятельное изучение продаж: 22 модуля, теория и практика через переписку."/><title>{h(title)} · Sales OS</title><link rel="manifest" href="{p('manifest.webmanifest')}"/><link rel="icon" type="image/svg+xml" href="{p('assets/favicon.svg')}"/><link rel="stylesheet" href="{css}"/>
<script>(function(){{try{{var v=localStorage.getItem('sales-os-theme')||'system';var d=v==='dark'||v==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light'}}catch(e){{}}}})()</script></head><body data-doc-id="{h(doc['id']) if doc else ''}" data-doc-kind="{doc['kind'] if doc else ''}"><a class="skip" href="#main">К основному содержимому</a><div class="mobile-shade" aria-hidden="true"></div><div class="app"><aside class="side" id="side-navigation"><div class="side-top"><span class="brand-mark">S/</span><span class="brand">Sales OS</span><span class="version">2.0</span><button class="iconbtn side-close" type="button" data-menu-close aria-label="Закрыть меню">×</button></div><div class="side-body"><div class="nav-caption">Рабочая область</div>{nav}<div class="nav-caption">Программа · 4 уровня</div>{groups}</div><div class="side-foot"><span>Общий прогресс</span> <strong data-global-pct>0%</strong><div class="progress tiny-track"><span data-global-fill></span></div></div></aside><div class="main-wrap"><header class="topbar"><button class="iconbtn menu-toggle" type="button" data-menu-toggle aria-label="Открыть меню" aria-controls="side-navigation" aria-expanded="false">{icon('menu')}</button><div class="row"><span style="font-size:12px;font-weight:600">Sales OS</span><span class="badge" style="font-size:10px">Knowledge</span></div><span class="spacer"></span><a class="toplink" href="{p('search/')}" aria-label="Поиск">{icon('search')}<span>Поиск</span><span class="search-shortcut">/</span></a><select class="theme-switch" data-theme-select aria-label="Цветовая тема"><option value="system">Системная</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select><a class="iconbtn" href="{p('settings/')}" title="Настройки" aria-label="Настройки">{icon('settings')}</a></header><main id="main" class="container {'reading-layout' if doc and doc['kind'] in ('theory','practice') else ''}">{body}<footer class="footer"><span>SALES OS / KNOWLEDGE BASE · 2026</span><span>Прогресс остаётся на устройстве · Материалы: редакционный черновик</span></footer></main></div></div><div class="toast" id="toast" role="status" aria-live="polite"></div><script type="module" src="{js}"></script></body></html>'''

def breadcrumb(crumbs,depth):
 output=[]
 for name,path in crumbs:
  output.append(f'<a href="{link(path,depth)}">{h(name)}</a>' if path is not None else f'<span>{h(name)}</span>')
 return '<div class="breadcrumb">'+(' '+icon('chevron')+' ').join(output)+'</div>'

def header(eyebrow,title,desc='',tags=''):
 return f'<header class="pagehead"><div class="eyebrow">{h(eyebrow)}</div><h1 class="h1">{h(title)}</h1>{f"<p class=\"intro\">{h(desc)}</p>" if desc else ""}{tags}</header>'

def editorial_badge():return '<span class="badge warning">Редакционный черновик</span>'

def intro_card(e,depth):
 return f'<a class="card" href="{link(route(e),depth)}"><div class="card-n">МОДУЛЬ {e["module"]}</div><h3>{h(e["title"])}</h3><p>{h(e.get("description", ""))}</p><div class="progress"><span data-module-fill="{e["module"]}"></span></div><div class="card-bottom"><span>{sum(x["kind"]=="theory" for x in BYMOD[e["module"]])} тем</span><span>·</span><span>{sum(x["kind"]=="practice" for x in BYMOD[e["module"]])} практики</span><span class="spacer"></span><strong data-module-pct="{e["module"]}">0%</strong></div></a>'

def status_badge(e):return f'<span class="badge" data-topic-status="{e["id"]}">Не начато</span>'

def list_item(e,depth):
 return f'<a class="item" href="{link(route(e),depth)}"><span class="number">{h(e["id"])}</span><div class="itext"><div class="ititle">{h(e["title"])}</div><div class="isub">{h(e["group"])} · {"Продвинутая" if e["level"]=="advanced" else "Обязательная"} {"практика" if e["kind"]=="practice" else "теория"}</div></div>{status_badge(e)}<span class="ic-right">{icon("chevron")}</span></a>'

def render_module(e):
 depth=2;mod=e['module'];theory=[x for x in BYMOD[mod] if x['kind']=='theory'];practice=[x for x in BYMOD[mod] if x['kind']=='practice']
 g=collections.OrderedDict()
 for topic in theory:g.setdefault(topic['group'],[]).append(topic)
 stage=e['stage'];txt=breadcrumb([('Roadmap','roadmap/'),(next(s['title'] for s in STAGES if s['id']==stage),f'level/{stage}/'),(e['title'],None)],depth)
 txt+=header(f'МОДУЛЬ {mod} · УРОВЕНЬ {stage}',e['title'],e.get('description',''),f'<div class="row wrap">{editorial_badge()}<span class="badge">{len(theory)} тем</span><span class="badge">{len(practice)} практик</span><span class="badge">{h(e.get("time",""))}</span></div>')
 txt+=f'<div class="module-summary"><strong>Результат изучения</strong><p>{h(e.get("outcome", ""))}</p></div>'
 txt+='<div class="section-head"><h2 class="h2">Теория</h2><span class="small muted">По порядку, от основ к практике</span></div>'
 for k,items in g.items():txt+=f'<section class="module-section"><h2>{h(k)} <span class="badge">{len(items)}</span></h2><div class="stack">'+''.join(list_item(x,depth) for x in items)+'</div></section>'
 txt+='<div class="section-head"><h2 class="h2">Практика</h2><span class="small muted">Применить знания</span></div><div class="stack">'+''.join(list_item(x,depth) for x in practice)+'</div>'
 txt+=f'<div class="editbox"><strong>Заметки по модулю</strong><p class="hint">Выводы и собственные наблюдения. Сохраняются только в браузере.</p><textarea data-note="{mod}-MODULE" aria-label="Заметки к модулю" placeholder="Что узнал и что попробовал на своих проектах..."></textarea><div class="hint" data-save-hint>Локальное сохранение</div></div>'
 return page_shell(txt,e['title'],depth,'',e)

def related_links(e,depth):
 targets=[ENTRIES[x] for x in e.get('related_practice',[]) if x in ENTRIES];
 if not targets:return ''
 return '<section class="module-section"><h2 class="h2">Связанная практика</h2><div class="stack">'+''.join(list_item(x,depth) for x in targets)+'</div></section>'

def sources_chips(e,depth):
 return '<div class="source-chips">'+''.join(f'<a class="badge" href="{link("source/"+sid+"/",depth)}">{h(sid)} · источник</a>' for sid in e['sources'] if any(s['id']==sid for s in SOURCES))+'</div>'

def render_document(e):
 depth=2;kind=e['kind'];isprac=kind=='practice';mod=ENTRIES[e['module']+'-MODULE'];mark,toc=md_html(e,depth)
 lesson_list=[x for x in BYMOD[e['module']] if x['kind']==kind]
 all_list=sorted([x for x in ENTRIES.values() if x['kind']==kind],key=lambda x:x['id']);idx=next(i for i,x in enumerate(all_list) if x['id']==e['id']);prev=all_list[idx-1] if idx else None;nextdoc=all_list[idx+1] if idx+1<len(all_list) else None
 text=breadcrumb([('Roadmap','roadmap/'),(f'Модуль {e["module"]}',route(mod)),(e['id'],None)],depth)
 text+=header(f'{"ПРАКТИКА" if isprac else "УЧЕБНЫЙ МАТЕРИАЛ"} · {e["id"]}',e['title'],'',f'<div class="row wrap">{editorial_badge()}<span class="badge">{h(e["group"])}</span><span class="badge">{"Продвинутый" if e["level"]=="advanced" else "Обязательный"} материал</span></div>')
 options=('<option value="not_started">Не начато</option><option value="in_progress">В процессе</option>'+('<option value="self_reviewed">Самопроверка выполнена</option><option value="completed">Выполнено (самоотметка)</option>' if isprac else '<option value="theory_completed">Теория изучена</option><option value="mastered">Навык освоен (самооценка)</option>'))
 text+=f'<div class="reading-controls"><label class="small muted" for="status">Мой статус</label><select class="status-select" id="status" data-status-control="{e["id"]}" data-kind="{kind}">{options}</select><button type="button" class="btn smallbtn" data-bookmark="{e["id"]}" aria-pressed="false">☆ В закладки</button><a class="btn smallbtn" href="{link(route(mod),depth)}">К модулю</a></div>'
 notes_title='Мой ответ на задание' if isprac else 'Мои заметки по теме'
 text+='<div class="reader-grid"><div class="reader"><article class="article" data-pagefind-body>'+mark+'</article>'+sources_chips(e,depth)
 if not isprac:text+=related_links(e,depth)
 else:
  text+='<div class="notice">Практическое задание оценивается самостоятельно. Отметка «Выполнено» не является независимой проверкой работы.</div>'
 text+=f'<div class="editbox"><strong>{notes_title}</strong><p class="hint">Текст хранится локально на этом устройстве. Не размещайте персональные данные клиентов без разрешения.</p><textarea data-note="{e["id"]}" aria-label="{notes_title}" placeholder="Напишите свои выводы, ответ или ссылку на рабочий документ..."></textarea><div class="hint" data-save-hint>Сохранение на устройстве</div></div>'
 text+='<nav class="navprevnext" aria-label="Соседние материалы">'
 for item,name in ((prev,'← Предыдущий материал'),(nextdoc,'Следующий материал →')):
  if item:text+=f'<a href="{link(route(item),depth)}">{name}<strong>{h(item["title"])}</strong></a>'
 text+='</nav></div><aside class="reader-aside"><h3>В этом материале</h3><nav class="toc">'
 text+=''.join(f'<a class="depth{3 if node=="h3" else 2}" href="#{h(slug)}">{h(label)}</a>' for label,slug,node in toc)
 text+='</nav></aside></div>'
 return page_shell(text,e['title'],depth,'',e)

def build_pages():
 if OUT.exists():shutil.rmtree(OUT)
 (OUT/'assets').mkdir(parents=True)
 for file,dest in [('src/styles/app.css','assets/app.css'),('src/scripts/app.js','assets/app.js')]:shutil.copy2(ROOT/file,OUT/dest)
 shutil.copy2(ROOT/'src/generated/client-index.json',OUT/'assets/client-index.json')
 def save(path,markup):
  full=OUT/path;full.parent.mkdir(parents=True,exist_ok=True);full.write_text(markup,encoding='utf-8')
 # Home
 st=f'<div class="eyebrow">ПЕРСОНАЛЬНАЯ СИСТЕМА ОБУЧЕНИЯ</div><h1 class="h1">Продажи. От понимания — к практике.</h1><p class="intro">Структурированная база знаний для работы с клиентами через переписку: 22 модуля, теория, упражнения и реальные проекты. Изучайте по порядку и сохраняйте свой прогресс.</p>'
 st+='<div class="stat-grid"><div class="stat"><div class="label">Пройдено теории</div><div class="value" data-global-theory>0 / 336</div><div class="label">336 уроков</div></div><div class="stat"><div class="label">Практика</div><div class="value" data-global-practice>0 / 72</div><div class="label">72 задания</div></div><div class="stat"><div class="label">Общий прогресс</div><div class="value" data-global-pct>0%</div><div class="progress"><span data-global-fill></span></div></div></div>'
 st+='<div class="dash-hero"><div class="eyebrow">ВАШ СЛЕДУЮЩИЙ ШАГ</div><h2 data-continue-title>Обмен ценностью</h2><p>Откройте последнюю тему или начните изучение с основ продаж.</p><a data-continue class="btn primary" href="lesson/01-001/">Продолжить изучение '+icon('arrow')+'</a></div>'
 st+='<div class="section-head"><h2 class="h2">Ваш путь обучения</h2><a href="roadmap/" class="small muted">Все 22 модуля →</a></div>'
 for s in STAGES:
  st+=f'<div class="level-head"><h2>0{s["id"]}. {h(s["title"])}</h2><a class="small muted" href="level/{s["id"]}/">Перейти к уровню →</a></div><div class="grid">'+''.join(intro_card(e,0) for e in STAGE_GROUPS[s['id']][:2])+'</div>'
 save('index.html',page_shell(st,'Главная',0,'home'))
 # Roadmap
 text=breadcrumb([('Обзор',''),('Roadmap',None)],1)+header('ОБУЧЕНИЕ · 4 УРОВНЯ','Дорожная карта продаж','Все направления обучения на одном экране. Выберите модуль — откроются только его материалы.')
 for s in STAGES:
  text+=f'<section><div class="level-head"><div><span class="eyebrow">УРОВЕНЬ 0{s["id"]} · {h(s["weeks"])}</span><h2>{h(s["title"])}</h2><p class="small muted">{h(s["desc"])}</p></div><a href="../level/{s["id"]}/" class="btn smallbtn">Обзор уровня →</a></div><div class="grid">'+''.join(intro_card(e,1) for e in STAGE_GROUPS[s['id']])+'</div></section>'
 save('roadmap/index.html',page_shell(text,'Roadmap',1,'roadmap'))
 # Level
 for s in STAGES:
  text=breadcrumb([('Roadmap','roadmap/'),(s['title'],None)],2)+header('УРОВЕНЬ 0'+str(s['id']),s['title'],s['desc']+' · '+s['weeks'])+'<div class="grid">'+''.join(intro_card(e,2) for e in STAGE_GROUPS[s['id']])+'</div>'
  save(f'level/{s["id"]}/index.html',page_shell(text,s['title'],2,'roadmap'))
 # Module + lesson + practice
 for e in ENTRIES.values():
  save(route(e)+'index.html',render_module(e) if e['kind']=='module' else render_document(e))
 # Practical directory
 practice=sorted([e for e in ENTRIES.values() if e['kind']=='practice'],key=lambda e:e['id'])
 text=breadcrumb([('Обзор',''),('Практика',None)],1)+header('ПРИМЕНЕНИЕ ЗНАНИЙ','Практические задания','72 упражнения, связанные с реальными задачами продаж сайтов и IT-услуг. Результаты сохраняются локально.')
 text+='<div class="filter-row"><label><span class="small muted">Модуль </span><select data-filter="module"><option value="">Все модули</option>'+''.join(f'<option value="{e["module"]}">{e["module"]} · {h(e["title"])}</option>' for e in ENTRIES.values() if e['kind']=='module')+'</select></label><label><span class="small muted">Уровень </span><select data-filter="level"><option value="">Любой</option><option value="required">Обязательные</option><option value="advanced">Продвинутые</option></select></label><span class="badge"><span data-filter-count>72</span> заданий</span></div><div class="stack">'
 text+=''.join(f'<div data-filter-item data-mod="{e["module"]}" data-level="{e["level"]}">{list_item(e,1)}</div>' for e in practice)+'</div>'
 save('practice/index.html',page_shell(text,'Практика',1,'practice'))
 # Sources
 kinds={'BOOKS':'Книги','VIDEOS':'Видео','COURSES':'Курсы','STUDIES':'Исследования','GUIDES_AND_LAWS':'Справочники и правила'}
 text=breadcrumb([('Обзор',''),('Источники',None)],1)+header('БИБЛИОТЕКА','Источники знаний','Книги, исследования, открытые курсы и видео. Ссылки предоставлены из исходной Markdown-базы; независимая редакционная проверка каждого материала не завершена.')
 for typ,label in kinds.items():
  items=[s for s in SOURCES if s['type']==typ]
  if not items:continue
  text+=f'<div class="section-head"><h2 class="h2">{h(label)}</h2><span class="badge">{len(items)}</span></div><div class="grid">'
  for s in items:
   text+=f'<a href="../source/{h(s["id"])}/" class="card source-card"><div class="card-n">{h(s["id"])}</div><h3>{h(s["title"])}</h3><p>{h(s.get("description") or s.get("author") or "Посмотреть источник и связанные материалы")}</p><span class="small muted">Подробнее →</span></a>'
  text+='</div>'
 save('sources/index.html',page_shell(text,'Источники',1,'sources'))
 for s in SOURCES:
  text=breadcrumb([('Источники','sources/'),(s['id'],None)],2)+header('ИСТОЧНИК · '+s['id'],s['title'],s.get('author') or '')
  text+='<div class="notice">Описание и ссылка перенесены из каталога Markdown. Полная самостоятельная проверка текста, видео или издания не заявляется.</div>'
  if s.get('description'):text+='<p class="intro">'+h(s['description'])+'</p>'
  url=s.get('url')
  if url and urlparse(url).scheme in ('http','https'):text+=f'<p><a href="{h(url)}" target="_blank" rel="noopener noreferrer" class="btn primary">Открыть первоисточник ↗</a></p>'
  connected=[x for x in ENTRIES.values() if s['id'] in x['sources'] and x['kind']=='theory']
  text+=f'<div class="section-head"><h2 class="h2">Связанные уроки</h2><span class="badge">{len(connected)}</span></div><div class="stack">'+''.join(list_item(e,2) for e in connected[:80])+'</div>'
  if len(connected)>80:text+='<p class="pill-note">Показаны первые 80 уроков.</p>'
  save(f'source/{s["id"]}/index.html',page_shell(text,s['title'],2,'sources'))
 # Saved
 text=breadcrumb([('Обзор',''),('Закладки',None)],1)+header('ЛИЧНАЯ БИБЛИОТЕКА','Закладки','Сохранённые уроки и упражнения. Все данные остаются в браузере.')+'<div class="stack" data-bookmark-results><div class="notice">Загрузка закладок…</div></div>'
 save('bookmarks/index.html',page_shell(text,'Закладки',1,'bookmarks'))
 # Search
 text=breadcrumb([('Обзор',''),('Поиск',None)],1)+header('ПОИСК ПО КУРСУ','Найти материал','Поиск по всему тексту уроков, практики и модулей. Результаты открываются отдельно.')+'<label class="small muted" for="search-input">Поисковый запрос</label><input class="search-field" id="search-input" type="search" data-search-input autocomplete="off" placeholder="Например, возражения, SPIN, обмен ценностью"/><div class="stack" style="margin-top:24px" data-search-results><div class="notice">Загрузка поискового индекса…</div></div>'
 save('search/index.html',page_shell(text,'Поиск',1,'search'))
 # Final project
 final_path=CONTENT/'FINAL_PROJECT.md'
 raw=final_path.read_text(encoding='utf-8')
 markup=MarkdownIt('default',{'html':False}).enable('table').render(raw)
 soup=BeautifulSoup(markup,'html.parser')
 for t in soup.select('table'):t.wrap(soup.new_tag('div',attrs={'class':'table-wrap'}))
 text=breadcrumb([('Обзор',''),('Итоговый проект',None)],1)+header('СКВОЗНАЯ ПРАКТИКА','От первого клиента до сделки','Практический маршрут, объединяющий навыки из разных модулей.')+'<div class="article" data-pagefind-body>'+str(soup)+'</div><div class="editbox"><strong>Мой итоговый проект</strong><textarea data-note="FINAL_PROJECT" aria-label="Заметки итогового проекта" placeholder="Цели, результаты, ссылки на документы и выводы..."></textarea><p class="hint" data-save-hint>Данные остаются в браузере</p></div>'
 save('final-project/index.html',page_shell(text,'Итоговый проект',1,'practice'))
 # Settings
 text=breadcrumb([('Обзор',''),('Настройки',None)],1)+header('ПРИЛОЖЕНИЕ','Настройки и данные','Все ответы, заметки и прогресс хранятся локально. Регистрация и сервер не требуются.')
 text+='<div class="settings-row"><div><strong>Цветовая тема</strong><p>Автоматическая, светлая или тёмная</p></div><select class="theme-switch" data-theme-select aria-label="Цветовая тема"><option value="system">Системная</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></div>'
 text+='<div class="settings-row"><div><strong>Резервная копия</strong><p>Экспорт текущего прогресса, заметок и закладок в JSON</p></div><button class="btn" data-export>'+icon('download')+' Экспортировать</button></div>'
 text+='<div class="settings-row"><div><strong>Импорт данных</strong><p>Поддерживаются Sales OS v2 и экспорт предыдущего index.html (v1)</p></div><label class="btn">Выбрать JSON <input data-import type="file" accept=".json,application/json" style="width:1px;position:absolute;opacity:0"/></label></div>'
 text+='<div class="notice"><strong>Важно о миграции:</strong> новый сайт не может сам читать localStorage старого файла, открытого через file://. Сначала экспортируйте JSON из предыдущего проекта, затем импортируйте его здесь. Старые отметки не становятся автоматически подтверждением уровня «мастер».</div>'
 text+='<div class="settings-row"><div><strong>Сохранить контент офлайн</strong><p>Загружает все страницы и поисковый индекс в кэш браузера. Нужен HTTPS или localhost.</p><p data-offline-status>Пакет ещё не установлен</p></div><button class="btn primary" data-offline-install>Загрузить офлайн-пакет</button></div>'
 text+='<div class="settings-row"><div><strong>Очистить офлайн-кэш</strong><p>Не удаляет ваши заметки, прогресс или закладки</p></div><button class="btn" data-offline-clear>Удалить кэш</button></div>'
 save('settings/index.html',page_shell(text,'Настройки',1,'settings'))
 # 404
 save('404.html',page_shell(header('ОШИБКА 404','Страница не найдена','Проверьте адрес или вернитесь к карте знаний.')+'<a class="btn primary" href="./roadmap/">К roadmap →</a>','Не найдено',0))
 # Search index full text for actual searchable content, is loaded only on search route
 index=[]
 for e in ENTRIES.values():
  raw=(CONTENT/e['path']).read_text(encoding='utf-8').split('---',2)[2]
  text=re.sub(r'\[([^]]+)\]\([^)]*\)',r'\1',raw)
  index.append({'id':e['id'],'kind':e['kind'],'module':e['module'],'title':e['title'],'text':text[:20000]})
 save('assets/search-index.json',json.dumps(index,ensure_ascii=False,separators=(',',':')))
 # Manifest + offline installation list
 save('assets/favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#000"/><text x="8" y="45" font-family="Arial,sans-serif" font-size="30" font-weight="bold" fill="white">S/</text></svg>')
 save('manifest.webmanifest',json.dumps({'name':'Sales OS — база знаний по продажам','short_name':'Sales OS','lang':'ru','start_url':'./','display':'standalone','background_color':'#ffffff','theme_color':'#000000','icons':[{'src':'assets/favicon.svg','sizes':'any','type':'image/svg+xml','purpose':'any'}]},ensure_ascii=False))
 srcs=['index.html','roadmap/index.html','settings/index.html','sources/index.html','search/index.html','bookmarks/index.html','practice/index.html','final-project/index.html','assets/app.js','assets/app.css','assets/favicon.svg','assets/client-index.json','assets/search-index.json','assets/offline-files.json','manifest.webmanifest']
 urls=sorted(set((u[:-len('index.html')] if u.endswith('index.html') else u) for u in srcs+[str(p.relative_to(OUT)) for p in OUT.rglob('*.html')]))
 version=hashlib.sha256((ROOT/'src/styles/app.css').read_bytes()+(ROOT/'src/scripts/app.js').read_bytes()+b''.join((CONTENT/e['path']).read_bytes() for e in sorted(ENTRIES.values(),key=lambda e:e['id']))).hexdigest()[:12]
 save('assets/offline-files.json',json.dumps({'version':version,'urls':urls},ensure_ascii=False))
 # Worker standard network-first; cache all on explicit command from settings. Same-origin only.
 save('sw.js',f'''const CACHE='sales-os-offline-{version}';self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{{const req=e.request;if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;e.respondWith((async()=>{{try{{return await fetch(req)}}catch{{const names=(await caches.keys()).filter(k=>k.startsWith('sales-os-offline-')).reverse();for(const name of names){{const c=await caches.open(name);const hit=await c.match(req);if(hit)return hit;}}return Response.error()}}}})());}});''')
 # sitemap useful for generated static hosting
 urls_count=len(list(OUT.rglob('index.html')))
 print('PASS: rendered',urls_count,'HTML documents; search records',len(index),'offline resources',len(urls),'build hash',version)
 return {'html':urls_count,'offline':len(urls),'search':len(index)}

if __name__=='__main__':build_pages()
