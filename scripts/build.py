#!/usr/bin/env python3
"""Reproducible offline static build of Sales OS using packaged Python libraries.
The full Markdown corpus is preserved as source and rendered into separate HTML pages.
"""
from __future__ import annotations
import collections, datetime, hashlib, html, json, os, pathlib, re, shutil, textwrap, unicodedata
from urllib.parse import urlparse, unquote, urljoin
from practice_feedback import load_guides, render_feedback
from trainer_content import load_scenarios, render_trainer
from today_content import render_today
import yaml
from markdown_it import MarkdownIt
from bs4 import BeautifulSoup
from jinja2 import Environment, BaseLoader, select_autoescape

ROOT=pathlib.Path(__file__).resolve().parents[1]
DEFAULT_OUT=ROOT/'dist-fallback';CONTENT=ROOT/'sales-knowledge-base';SOURCE=json.loads((ROOT/'src/generated/content-manifest.json').read_text(encoding='utf-8'))
SITE_URL=os.environ.get('SITE_URL','https://sl-os.vercel.app').rstrip('/')
ENTRIES=SOURCE['entries']; GUIDES=load_guides(ENTRIES); STAGES=SOURCE['stages']; SOURCES=SOURCE['sources']
SCENARIOS=load_scenarios(ENTRIES)
STAGE_GROUPS={s['id']:[] for s in STAGES}
for k,e in ENTRIES.items():
 if e['kind']=='module':STAGE_GROUPS[e['stage']].append(e)
for group in STAGE_GROUPS.values():group.sort(key=lambda e:e['module'])
BYMOD=collections.defaultdict(list)
for e in ENTRIES.values():BYMOD[e['module']].append(e)
for group in BYMOD.values():group.sort(key=lambda e:(0 if e['kind']=='module' else 1 if e['kind']=='theory' else 2,e.get('order',0)))

TEMPLATE=Environment(loader=BaseLoader(),autoescape=select_autoescape(default=True))
# Inline icon symbols: SVG is inert, presentation only; buttons live in regular HTML.
ICONS=json.loads((ROOT/'src/lib/icons.json').read_text(encoding='utf-8'))
ICONS.update({'dashboard':ICONS['home'],'check':ICONS['practice']})

def icon(name,size=16):return f'<svg class="icon" data-icon="{name}" width="{size}" height="{size}" style="--icon-size:{size}px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+ICONS[name]+'</svg>'

def quantity(count,forms):
 n=abs(count)%100
 index=2 if 11<=n<=14 else 0 if n%10==1 else 1 if 2<=n%10<=4 else 2
 return f'{count} {forms[index]}'

def h(s):return html.escape(str(s),quote=True)
def route(e):return f"{ {'module':'module','theory':'lesson','practice':'practice'}[e['kind']]}/{e['id']}/"
def link(path,depth):return '../'*depth+path

def annotate_table(table):
 labels=[cell.get_text(' ',strip=True) for cell in table.select('thead th')]
 table['role']='table'
 for section in table.find_all(['thead','tbody'],recursive=False):
  section['role']='rowgroup'
  for row in section.find_all('tr',recursive=False):
   row['role']='row'
   for index,cell in enumerate(row.find_all(['td','th'],recursive=False)):
    cell['role']='columnheader' if cell.name=='th' else 'cell'
    cell['data-label']=labels[index] if index<len(labels) else ''

def md_html(e,depth):
 path=CONTENT/e['path'];raw=path.read_text(encoding='utf-8');body=raw.split('---',2)[2].strip()
 md=MarkdownIt('default',{'html':False,'linkify':False,'typographer':True}).enable('table').enable('strikethrough')
 markup=md.render(body)
 soup=BeautifulSoup(markup,'html.parser')
 if soup.h1:soup.h1.decompose()
 if e['kind']=='module':
  for heading in list(soup.find_all('h2')):
   if heading.get_text(' ',strip=True) not in ('Порядок изучения','Обязательная практика'):continue
   node=heading
   while node:
    following=node.find_next_sibling()
    if node is not heading and node.name=='h2':break
    node.decompose();node=following
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
 for t in soup.select('table'):
  annotate_table(t)
  t.wrap(soup.new_tag('div',attrs={'class':'table-wrap','role':'group','tabindex':'0','aria-label':'Широкая таблица. Используйте горизонтальную прокрутку, чтобы увидеть все столбцы.'}))
 return str(soup),toc

def slugify(value):
 value=unicodedata.normalize('NFKC',value.lower());value=re.sub(r'[^\w\-\s]+','',value,flags=re.UNICODE);return re.sub(r'\s+','-',value).strip('-') or 'section'

def page_shell(body,title,depth,active='',doc=None,description=''):
 p=lambda x:link(x,depth)
 current=active;mod=doc.get('module') if doc else None
 utility=current in ('settings','bookmarks','review','search','today') or title=='Не найдено'
 meta_description=(description or (f'{title} — практическое задание модуля {mod} в Sales OS. Ответы и самооценка хранятся на этом устройстве.' if doc and doc.get('kind')=='practice' else f'{title} — учебный материал Sales OS для самостоятельного изучения продаж и работы с клиентами.')).replace('\n',' ').strip()[:160]
 if not current and doc:
  current='practice' if doc.get('kind')=='practice' else 'roadmap'
 nav_top=[('dashboard','Обзор','', 'home'),('map','Roadmap','roadmap/','roadmap'),('check','Практика','practice/','practice'),('message','Тренажёр переписки','trainer/','trainer'),('clock','Занятие на сегодня','today/','today'),('clock','Очередь повтора','review/','review'),('search','Поиск','search/','search'),('library','Источники','sources/','sources'),('book','Справочники','library/','library'),('star','Закладки','bookmarks/','bookmarks')]
 nav=''.join(f'<a class="nav-item {"active" if current==a else ""}" href="{p(url)}" aria-label="{h(label)}" {"aria-current=\"page\"" if current==a else ""} title="{h(label)}">{icon(ic)}<span>{h(label)}</span></a>' for ic,label,url,a in nav_top)
 nav=nav.replace('title="Очередь повтора">'+icon('clock')+'<span>Очередь повтора</span></a>','title="Очередь повтора">'+icon('clock')+'<span>Очередь повтора</span><span class="nav-count" data-review-count hidden></span></a>')
 groups=''
 for s in STAGES:
  links=''.join(f'<a class="nav-item {"active" if mod==e["module"] else ""}" href="{p(route(e))}" aria-label="{h(e["module"]+" · "+e["title"])}" {"aria-current=\"page\"" if mod==e["module"] and doc and doc.get("kind")=="module" else "aria-current=\"location\"" if mod==e["module"] else ""} title="{h(e["title"])}"><span class="label-number">{e["module"]}</span><span>{h(e["title"])}</span></a>' for e in STAGE_GROUPS[s['id']])
  selected=any(e['module']==mod for e in STAGE_GROUPS[s['id']]);
  groups+=f'<details class="nav-group" {"open" if selected else ""}><summary><span class="num">0{s["id"]}</span><span>{h(s["title"])}</span><span class="arr">{icon("chevron",14)}</span></summary><div class="nav-sub">{links}</div></details>'
 css=p('assets/app.css');js=p('assets/app.js');store_js=p('assets/user-store.js')
 return f'''<!doctype html><html lang="ru" data-root="{p('')}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="theme-color" content="#ffffff" data-theme-color/><meta name="description" content="{h(meta_description)}"/><meta name="robots" content="{'noindex, nofollow' if utility else 'index, follow'}"/><meta property="og:title" content="{h(title)} · Sales OS"/><meta property="og:description" content="{h(meta_description)}"/><meta property="og:type" content="website"/><meta name="twitter:card" content="summary"/><title>{h(title)} · Sales OS</title><link rel="manifest" href="{p('manifest.webmanifest')}"/><link rel="icon" type="image/png" href="{p('assets/brand/favicon-light.png')}" sizes="32x32" media="(prefers-color-scheme: light)"/><link rel="icon" type="image/png" href="{p('assets/brand/favicon-dark.png')}" sizes="32x32" media="(prefers-color-scheme: dark)"/><link rel="apple-touch-icon" href="{p('assets/brand/app-icon-192.png')}"/><link rel="preload" href="{p('assets/fonts/Geist-Variable.woff2')}" as="font" type="font/woff2" crossorigin/><link rel="stylesheet" href="{css}"/>
<noscript><style>@media(max-width:768px){{.app{{display:block}}.side{{position:static;top:auto;width:auto;height:auto;transform:none;overflow:visible;visibility:visible}}.side-close,.menu-toggle,.mobile-shade{{display:none!important}}}}</style></noscript>
<script>(function(){{try{{var v=localStorage.getItem('sales-os-theme')||'system';var d=v==='dark'||v==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';var c=document.querySelector('[data-theme-color]');if(c)c.content=d?'#000000':'#ffffff'}}catch(e){{}}}})()</script></head><body data-doc-id="{h(doc['id']) if doc else ''}" data-doc-kind="{doc['kind'] if doc else ''}"><a class="skip" href="#main">К основному содержимому</a><div class="mobile-shade" aria-hidden="true"></div><div class="app"><aside class="side" id="side-navigation" aria-label="Навигация по Sales OS" tabindex="-1"><div class="side-top"><a class="brand-lockup" href="{p('')}" aria-label="Sales OS — на главную"><img class="brand-logo brand-logo-light" src="{p('assets/brand/logo-light.png')}" alt="" width="1361" height="754"/><img class="brand-logo brand-logo-dark" src="{p('assets/brand/logo-dark.png')}" alt="" width="1361" height="754"/><img class="brand-symbol brand-symbol-light" src="{p('assets/brand/mark-light.png')}" alt="" width="512" height="512"/><img class="brand-symbol brand-symbol-dark" src="{p('assets/brand/mark-dark.png')}" alt="" width="512" height="512"/></a><span class="version">2.0</span><button class="iconbtn side-close" type="button" data-menu-close aria-label="Закрыть меню">{icon("close")}</button></div><div class="side-body"><div class="nav-caption">Рабочая область</div>{nav}<div class="nav-caption">Программа · 4 уровня</div>{groups}</div><div class="side-foot"><span>Общий прогресс</span> <strong data-global-pct>0%</strong><div class="progress tiny-track" role="progressbar" aria-label="Общий прогресс обучения" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-global-progress><span data-global-fill></span></div></div></aside><div class="main-wrap" data-drawer-background><header class="topbar"><button class="iconbtn menu-toggle" type="button" data-menu-toggle aria-label="Открыть меню" aria-controls="side-navigation" aria-expanded="false">{icon('menu')}</button><a class="brand-compact" href="{p('')}" aria-label="На главную Sales OS"><img class="brand-symbol brand-symbol-light" src="{p('assets/brand/mark-light.png')}" alt="" width="512" height="512"/><img class="brand-symbol brand-symbol-dark" src="{p('assets/brand/mark-dark.png')}" alt="" width="512" height="512"/><span>Sales OS</span></a><span class="spacer"></span><a class="toplink" href="{p('search/')}" aria-label="Поиск">{icon('search')}<span>Поиск</span><span class="search-shortcut">/</span></a><details class="theme-picker" data-theme-picker><summary class="theme-picker-trigger" data-theme-trigger aria-haspopup="menu" aria-expanded="false" aria-controls="theme-menu" aria-label="Цветовая тема: Системная"><span data-theme-label>Системная</span>{icon('chevron-down')}</summary><div class="theme-menu" id="theme-menu" role="menu" aria-label="Выбор цветовой темы"><button class="theme-option" type="button" role="menuitemradio" aria-checked="true" tabindex="0" data-theme-option="system"><span>Системная</span><span class="theme-option-check">{icon('checkmark')}</span></button><button class="theme-option" type="button" role="menuitemradio" aria-checked="false" tabindex="-1" data-theme-option="light"><span>Светлая</span><span class="theme-option-check">{icon('checkmark')}</span></button><button class="theme-option" type="button" role="menuitemradio" aria-checked="false" tabindex="-1" data-theme-option="dark"><span>Тёмная</span><span class="theme-option-check">{icon('checkmark')}</span></button></div></details><a class="iconbtn" href="{p('settings/')}" title="Настройки" aria-label="Настройки" aria-current="{'page' if current=='settings' else 'false'}">{icon('settings',18)}</a></header><main id="main" tabindex="-1" class="container {'reading-layout' if doc and doc['kind'] in ('theory','practice') else ''}">{body}<footer class="footer"><span>SALES OS / KNOWLEDGE BASE · 2026</span><span>Прогресс остаётся на устройстве · Материалы: редакционный черновик</span></footer></main></div></div><div class="toast" id="toast" role="status" aria-live="polite"></div><template id="ui-row-chevron">{icon("chevron")}</template><script defer src="{p("assets/today-core.js")}"></script><script defer src="{p("assets/trainer-core.js")}"></script><script defer src="{store_js}"></script><script defer src="{js}"></script><script defer src="{p("assets/practice-feedback.js")}"></script><script defer src="{p("assets/trainer.js")}"></script><script defer src="{p("assets/today.js")}"></script></body></html>'''

def breadcrumb(crumbs,depth):
 output=[]
 for name,path in crumbs:
  output.append(f'<a href="{link(path,depth)}">{h(name)}</a>' if path is not None else f'<span aria-current="page">{h(name)}</span>')
 return '<nav class="breadcrumb" aria-label="Хлебные крошки">'+(' '+icon('chevron')+' ').join(output)+'</nav>'

def header(eyebrow,title,desc='',tags=''):
 return f'<header class="pagehead"><div class="eyebrow">{h(eyebrow)}</div><h1 class="h1">{h(title)}</h1>{f"<p class=\"intro\">{h(desc)}</p>" if desc else ""}{tags}</header>'

def editorial_badge():return '<span class="badge warning">Редакционный черновик</span>'

def intro_card(e,depth):
 return f'<a class="card" href="{link(route(e),depth)}"><div class="card-n">МОДУЛЬ {e["module"]}</div><h3>{h(e["title"])}</h3><p>{h(e.get("description", ""))}</p><div class="progress" role="progressbar" aria-label="Прогресс модуля {e["module"]}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0%" data-module-progress="{e["module"]}"><span data-module-fill="{e["module"]}"></span></div><div class="card-bottom"><span>{sum(x["kind"]=="theory" for x in BYMOD[e["module"]])} тем</span><span>·</span><span>{sum(x["kind"]=="practice" for x in BYMOD[e["module"]])} практики</span><span class="spacer"></span><strong data-module-pct="{e["module"]}">0%</strong></div></a>'

def status_badge(e):return f'<span class="badge" data-topic-status="{e["id"]}">Не начато</span>'

def list_item(e,depth):
 return f'<a class="item entry-row" href="{link(route(e),depth)}"><div class="itext"><div class="ititle">{h(e["title"])}</div><div class="isub">{h(e["group"])} · {"Продвинутая" if e["level"]=="advanced" else "Обязательная"} {"практика" if e["kind"]=="practice" else "теория"}</div></div><span class="number">{h(e["id"])}</span>{status_badge(e)}<span class="ic-right">{icon("chevron")}</span></a>'

def render_module(e):
 depth=2;mod=e['module'];theory=[x for x in BYMOD[mod] if x['kind']=='theory'];practice=[x for x in BYMOD[mod] if x['kind']=='practice']
 g=collections.OrderedDict()
 for topic in theory:g.setdefault(topic['group'],[]).append(topic)
 stage=e['stage'];txt=breadcrumb([('Roadmap','roadmap/'),(next(s['title'] for s in STAGES if s['id']==stage),f'level/{stage}/'),(e['title'],None)],depth)
 txt+=header(f'МОДУЛЬ {mod} · УРОВЕНЬ {stage}',e['title'],e.get('description',''),f'<div class="row wrap">{editorial_badge()}<span class="badge">{quantity(len(theory),("тема","темы","тем"))}</span><span class="badge">{quantity(len(practice),("практика","практики","практик"))}</span><span class="badge">{h(e.get("time",""))}</span></div>')
 txt+=f'<div class="module-summary"><strong>Результат изучения</strong><p>{h(e.get("outcome", ""))}</p></div>'
 txt+=f'<nav class="module-actions" aria-label="Действия модуля"><a class="btn primary" data-module-continue="{mod}" href="{link(route(theory[0]),depth)}">Начать модуль</a><a class="btn" href="#module-theory">Теория</a><a class="btn" href="#module-practice">Практика</a><a class="btn" href="#module-overview">Обзор</a></nav>'
 module_body,_=md_html(e,depth)
 chapter=BeautifulSoup(module_body,'html.parser')
 for node in list(chapter.contents):
  if getattr(node,'name',None)=='h2':break
  node.extract()
 module_body=str(chapter)
 txt+=f'<article id="module-overview" class="article module-reading prose" data-pagefind-body data-search-id="{e["id"]}" data-search-level="{e["level"]}" data-search-module="{mod}" data-search-kind="module" data-pagefind-filter="level[data-search-level], module[data-search-module], kind[data-search-kind]" data-pagefind-meta="id[data-search-id], level[data-search-level], module[data-search-module], kind[data-search-kind]">'+module_body+'</article>'
 txt+='<div class="section-head"><h2 class="h2" id="module-theory">Теория</h2><span class="small muted">По порядку, от основ к практике</span></div>'
 for k,items in g.items():txt+=f'<section class="module-section"><h2>{h(k)} <span class="badge">{len(items)}</span></h2><div class="stack">'+''.join(list_item(x,depth) for x in items)+'</div></section>'
 txt+='<div class="section-head"><h2 class="h2" id="module-practice">Практика</h2><span class="small muted">Применить знания</span></div><div class="stack">'+''.join(list_item(x,depth) for x in practice)+'</div>'
 txt+=f'<div class="editbox"><strong>Заметки по модулю</strong><p class="hint">Выводы и собственные наблюдения. Сохраняются только в браузере.</p><textarea data-note="{mod}-MODULE" aria-label="Заметки к модулю" placeholder="Что узнал и что попробовал на своих проектах..."></textarea><div class="hint" data-save-hint>Локальное сохранение</div></div>'
 return page_shell(txt,e['title'],depth,'',e)

def related_links(e,depth):
 targets=[ENTRIES[x] for x in e.get('related_practice',[]) if x in ENTRIES];
 if not targets:return ''
 return '<section class="module-section"><h2 class="h2">Связанная практика</h2><div class="stack">'+''.join(list_item(x,depth) for x in targets)+'</div></section>'

LIBRARIES={
 'glossary':('Глоссарий продаж','Рабочие определения терминов и сокращений курса.',re.compile(r'\b(?:b2b|b2c|b2g|spin|bant|spiced|meddpicc|icp|jtbd|crm|roi|cac|ltv|tco|nps|csat|rfp|batna|zopa)\b|воронк|метрик|квалификац|позиционирован|ценообразован|окупаемост|юнит.?эконом',re.I),'GLOSSARY.md'),
 'cases':('Сквозные учебные кейсы','Вымышленные ситуации для разбора решений и ограничений.',re.compile(r'клиент|покупател|ситуац|кейс|диалог|возражен|переговор|discovery|квалификац|заинтересованн|лид',re.I),'CASE_LIBRARY.md'),
 'templates':('Рабочие шаблоны','Редактируемые черновики сообщений, документов и рабочих записей.',re.compile(r'сообщен|follow.?up|переписк|скрипт|шаблон|предложен|\bкп\b|бриф|карточк|чек.?лист|письменн|текстов|контакт|договор|предоплат|демонстрац|ответ на',re.I),'TEMPLATE_LIBRARY.md'),
}

def related_libraries(e,depth):
 topic=(e['title']+' '+e.get('group','')).lower()
 matches=[(key,value) for key,value in LIBRARIES.items() if value[2].search(topic)]
 if not matches:return ''
 items=''.join(f'<a class="library-reference" href="{link("library/"+key+"/",depth)}"><span class="badge">Справочник</span><strong>{h(value[0])}</strong><span class="small muted">Открыть →</span></a>' for key,value in matches)
 return '<section class="library-references" aria-labelledby="related-library-title"><div class="section-head"><h2 class="h2" id="related-library-title">Справка по теме</h2></div><div class="library-reference-list">'+items+'</div></section>'

def sources_chips(e,depth):
 return '<div class="source-chips">'+''.join(f'<a class="badge" href="{link("source/"+sid+"/",depth)}">{h(sid)} · источник</a>' for sid in e['sources'] if any(s['id']==sid for s in SOURCES))+'</div>'

def practice_rubric(e):
 if e['id']=='FINAL_PROJECT':
  raw=(CONTENT/'FINAL_PROJECT.md').read_text(encoding='utf-8')
  return [(f'criterion-{index}',label,description) for index,(label,description) in enumerate(re.findall(r'^\d+\. \*\*(.+?):\*\* (.+)$',raw,re.M),1)]
 raw=(CONTENT/e['path']).read_text(encoding='utf-8').split('---',2)[2]
 lines=raw.splitlines();start=next((i for i,line in enumerate(lines) if re.match(r'^##\s+Рубрика проверки(?:\s|$)',line.strip(),re.I)),None)
 if start is None:return []
 rows=[]
 for line in lines[start+1:]:
  line=line.strip()
  if re.match(r'^#{1,2}\s',line):break
  if not (line.startswith('|') and line.endswith('|')):continue
  cells=[]
  for cell in re.split(r'(?<!\\)\|',line[1:-1]):
   cell=cell.replace('\\|','|')
   cell=re.sub(r'`([^`]+)`',r'\1',cell)
   cell=re.sub(r'\*\*(.*?)\*\*|\*(.*?)\*',lambda match:match.group(1) or match.group(2),cell)
   cell=re.sub(r'<br\s*/?>',' ',cell,flags=re.I)
   cells.append(re.sub(r'\s+',' ',cell).strip())
  if len(cells)<2 or all(re.fullmatch(r':?-{3,}:?',cell) for cell in cells) or re.match(r'^критерий(?: для этого задания)?$',cells[0],re.I):continue
  if cells[0] and cells[1]:rows.append((f'criterion-{len(rows)+1}',cells[0],cells[1]))
 return rows

def practice_workspace(e):
 criteria=practice_rubric(e)
 if len(criteria)<3:raise ValueError(f'Practice rubric missing for {e["id"]}')
 fields=[]
 for index,(criterion,label,description) in enumerate(criteria,1):
  options=''.join(f'<label class="review-choice"><input type="radio" name="review-{e["id"]}-{criterion}" value="{value}" data-practice-review="{criterion}"/><span>{text}</span></label>' for value,text in enumerate(('Пока не выполнено','Частично','Выполнено по условию')))
  fields.append(f'<fieldset class="practice-criterion" id="criterion-{e["id"]}-{criterion}" data-practice-criterion="{criterion}" data-practice-label="{h(label)}" data-practice-description="{h(description)}"><legend><span class="criterion-number">{index:02}</span>{h(label)}</legend><p>{h(description)}</p><label for="answer-{e["id"]}-{criterion}">Мой ответ</label><textarea id="answer-{e["id"]}-{criterion}" data-practice-answer="{criterion}" rows="3" maxlength="10000" placeholder="Запишите наблюдаемый результат, основания и оставшиеся вопросы…"></textarea><fieldset class="self-review" aria-label="Самопроверка: {h(label)}"><legend>Самопроверка по критерию</legend>{options}</fieldset></fieldset>')
 return f'<section class="practice-workspace" id="workspace-{e["id"]}" aria-labelledby="practice-workspace-{e["id"]}"><div class="section-head"><div><span class="eyebrow">ЛИЧНАЯ ПРАКТИКА</span><h2 class="h2" id="practice-workspace-{e["id"]}">Ответ и следующая итерация</h2></div></div><p class="muted">Ответьте по критериям самого задания. Черновик хранится только в этом браузере; в каждой итерации сохраняется снимок ответа и самооценки.</p><nav class="criterion-nav" aria-label="Критерии ответа">{''.join(f'<a href="#criterion-{e["id"]}-{criterion}" title="{h(label)}">{index}. {h(label)}</a>' for index,(criterion,label,description) in enumerate(criteria,1))}</nav><p class="small muted" data-criteria-progress role="status" aria-live="polite">Заполнено 0 из {len(criteria)}</p><p><button class="btn" type="submit" form="form-{e["id"]}" data-practice-save-top>Сохранить итерацию</button> <a class="btn" href="#history-{e["id"]}">История итераций</a> <a class="btn" href="#feedback-{e["id"]}">Подсказки и разбор</a> <a class="btn" href="#comparison-{e["id"]}">Сравнить итерации</a></p><form id="form-{e["id"]}" data-practice-form="{e["id"]}" data-practice-title="{h(e["title"])}">'+''.join(fields)+f'<label for="next-step-{e["id"]}">Что проверить или улучшить в следующей итерации?</label><textarea id="next-step-{e["id"]}" data-practice-next rows="3" maxlength="10000" placeholder="Один конкретный следующий шаг…"></textarea><div class="practice-form-actions"><button class="btn primary" type="submit" data-practice-save>Сохранить итерацию</button><span data-practice-draft-status role="status" aria-live="polite">Загрузка черновика…</span></div></form><section class="practice-draft-versions" data-practice-versions hidden aria-labelledby="draft-versions-{e["id"]}"><h3 id="draft-versions-{e["id"]}">Другие черновики из объединённых копий</h3><div data-practice-versions-list></div></section><section class="practice-history" id="history-{e["id"]}" aria-labelledby="practice-history-{e["id"]}"><div class="section-head"><h3 class="h2" id="practice-history-{e["id"]}">История итераций</h3><span class="small muted" data-practice-history-count>0 сохранено</span></div><div data-practice-history-list><p class="muted">Сохранённых итераций пока нет.</p></div></section>'+render_feedback(e["id"],GUIDES)+'</section>'

def render_document(e):
 depth=2;kind=e['kind'];isprac=kind=='practice';mod=ENTRIES[e['module']+'-MODULE'];mark,toc=md_html(e,depth)
 lesson_list=[x for x in BYMOD[e['module']] if x['kind']==kind]
 all_list=sorted([x for x in ENTRIES.values() if x['kind']==kind],key=lambda x:x['id']);idx=next(i for i,x in enumerate(all_list) if x['id']==e['id']);prev=all_list[idx-1] if idx else None;nextdoc=all_list[idx+1] if idx+1<len(all_list) else None
 text=breadcrumb([('Roadmap','roadmap/'),(f'Модуль {e["module"]}',route(mod)),(e['id'],None)],depth)
 text+=header(f'{"ПРАКТИКА" if isprac else "УЧЕБНЫЙ МАТЕРИАЛ"} · {e["id"]}',e['title'],'',f'<div class="row wrap">{editorial_badge()}<span class="badge">{h(e["group"])}</span><span class="badge">{"Продвинутый" if e["level"]=="advanced" else "Обязательный"} материал</span></div>')
 options=('<option value="not_started">Не начато</option><option value="in_progress">В процессе</option>'+('<option value="self_reviewed">Самопроверка выполнена</option><option value="completed">Выполнено (самоотметка)</option>' if isprac else '<option value="theory_completed">Теория изучена</option><option value="mastered">Навык освоен (самооценка)</option>'))
 text+=f'<div class="reading-controls"><label class="small muted" for="status">Мой статус</label><select class="status-select" id="status" data-status-control="{e["id"]}" data-kind="{kind}">{options}</select><button type="button" class="btn smallbtn" data-bookmark="{e["id"]}" aria-pressed="false">{icon("star")}<span data-bookmark-label>В закладки</span></button><a class="btn smallbtn" href="{link(route(mod),depth)}">К модулю</a><details class="revisit-schedule"><summary class="btn smallbtn">Вернуться позже</summary><div class="revisit-popover"><label for="revisit-delay-{e["id"]}">Показать снова</label><select id="revisit-delay-{e["id"]}" data-revisit-delay="{e["id"]}"><option value="1">Завтра</option><option value="3">Через 3 дня</option><option value="7">Через неделю</option></select><button type="button" class="btn smallbtn" data-revisit-add="{e["id"]}" data-revisit-title="{h(e["title"])}">Добавить в очередь</button><p class="small muted" data-revisit-status="{e["id"]}" role="status" aria-live="polite"></p></div></details></div>'
 if isprac:
  toc.extend([('Мой ответ',f'workspace-{e["id"]}','h2'),('История итераций',f'history-{e["id"]}','h2'),('Подсказки и разбор',f'feedback-{e["id"]}','h2'),('Сравнение итераций',f'comparison-{e["id"]}','h2')])
  text+=f'<a class="btn primary" href="#workspace-{e["id"]}">Перейти к ответу</a>'
 if toc:
  text+='<details class="toc-disclosure"><summary>Содержание материала'+icon("chevron-down")+'</summary><nav class="toc" aria-label="Содержание материала">'
  text+=''.join(f'<a class="depth{3 if node=="h3" else 2}" href="#{h(slug)}">{h(label)}</a>' for label,slug,node in toc)
  text+='</nav></details>'
 notes_title='Мой ответ на задание' if isprac else 'Мои заметки по теме'
 text+=f'<div class="reader-grid"><div class="reader"><article class="article" data-pagefind-body data-search-id="{e["id"]}" data-search-level="{e["level"]}" data-search-module="{e["module"]}" data-search-kind="{kind}" data-pagefind-filter="level[data-search-level], module[data-search-module], kind[data-search-kind]" data-pagefind-meta="id[data-search-id], level[data-search-level], module[data-search-module], kind[data-search-kind]">'+mark+'</article>'+related_libraries(e,depth)+sources_chips(e,depth)
 if not isprac:text+=related_links(e,depth)
 else:
  text+='<div class="notice">Практическое задание оценивается самостоятельно. Отметка «Выполнено» не является независимой проверкой работы.</div>'
  text+=practice_workspace(e)
 text+=f'<div class="editbox"><strong>{notes_title}</strong><p class="hint">Текст хранится локально на этом устройстве. Не размещайте персональные данные клиентов без разрешения.</p><textarea data-note="{e["id"]}" aria-label="{notes_title}" placeholder="Напишите свои выводы, ответ или ссылку на рабочий документ..."></textarea><div class="hint" data-save-hint>Загрузка заметки…</div></div>'
 text+=f'<div class="reading-completion"><label for="status-bottom">Мой статус</label><select class="status-select" id="status-bottom" data-status-control="{e["id"]}" data-kind="{kind}">{options}</select></div>'
 text+='<nav class="navprevnext" aria-label="Соседние материалы">'
 for item,name in ((prev,'← Предыдущий материал'),(nextdoc,'Следующий материал →')):
  if item:text+=f'<a href="{link(route(item),depth)}">{name}<strong>{h(item["title"])}</strong></a>'
 text+='</nav></div><aside class="reader-aside"><h3>В этом материале</h3><nav class="toc">'
 text+=''.join(f'<a class="depth{3 if node=="h3" else 2}" href="#{h(slug)}">{h(label)}</a>' for label,slug,node in toc)
 text+='</nav></aside></div>'
 return page_shell(text,e['title'],depth,'',e,description=e.get('description') or f'{e["title"]} — {"практическое задание" if isprac else "учебный материал"} модуля {e["module"]}, {e.get("group", "").lower()}. Ответы и заметки хранятся на этом устройстве.')

def render_library(identifier):
 title,description,_,filename=LIBRARIES[identifier]
 raw=(CONTENT/filename).read_text(encoding='utf-8')
 parts=raw.split('---',2)
 if len(parts)!=3:raise ValueError(f'Missing library metadata: {filename}')
 markup=MarkdownIt('default',{'html':False}).enable('table').render(parts[2])
 soup=BeautifulSoup(markup,'html.parser')
 if soup.h1:soup.h1.decompose()
 anchors=collections.Counter()
 for heading in soup.find_all(['h2','h3']):
  slug=slugify(heading.get_text(' ',strip=True));anchors[slug]+=1
  heading['id']=slug if anchors[slug]==1 else f'{slug}-{anchors[slug]}'
 for anchor in soup.select('a[href]'):
  url=anchor.get('href','')
  if url.startswith(('http://','https://')):anchor['rel']='noopener noreferrer';anchor['target']='_blank'
  elif url.startswith(('javascript:','data:')):anchor['href']='#'
 for table in soup.select('table'):
  annotate_table(table)
  table.wrap(soup.new_tag('div',attrs={'class':'table-wrap','role':'group','tabindex':'0','aria-label':'Широкая таблица. Используйте горизонтальную прокрутку, чтобы увидеть все столбцы.'}))
 depth=2
 crumb=breadcrumb([('Обзор',''),('Справочники','library/'),(title,None)],depth)
 text=crumb+header('СПРАВОЧНЫЙ МАТЕРИАЛ · РЕДАКЦИОННЫЙ ЧЕРНОВИК',title,description)
 copy=' data-template-copy=""' if identifier=='templates' else ''
 text+=f'<article class="article library-content prose" data-library-id="{identifier}" data-pagefind-body data-search-id="{identifier}" data-search-level="extra" data-search-module="extra" data-search-kind="library" data-pagefind-filter="level[data-search-level], module[data-search-module], kind[data-search-kind]" data-pagefind-meta="id[data-search-id], level[data-search-level], module[data-search-module], kind[data-search-kind]"{copy}>{soup}</article><a class="btn" href="{link("library/",depth)}">← Ко всем справочникам</a>'
 return page_shell(f'<div data-library-id="{identifier}">{text}</div>',title,depth,'library')

def render_editorial_review():
 ledger=json.loads((CONTENT/'editorial-review-ledger.json').read_text(encoding='utf-8'))
 reviews_by_document=collections.defaultdict(list)
 for record in ledger['records']:reviews_by_document[record['documentId']].append(record)
 pending=sum(entry['status']!='verified' for entry in ENTRIES.values());verified=len(ENTRIES)-pending
 text=breadcrumb([('Обзор',''),('Справочники','library/'),('Готовность материалов',None)],1)
 text+=header('РЕДАКТОРСКАЯ ПРИЁМКА','Готовность материалов',f'Проверяемая карта редакционного статуса {len(ENTRIES)} основных материалов курса.')
 text+=f'<section class="notice editorial-notice" aria-labelledby="editorial-status-title"><div><strong id="editorial-status-title">Редакторская проверка не завершена</strong><p>{verified} из {len(ENTRIES)} документов имеют запись полной редакторской проверки; {pending} ожидают рецензента. Технические проверки не снимают статус черновика.</p></div></section>'
 text+=f'<div class="stat-grid editorial-summary" aria-label="Сводка редакционной проверки"><div class="stat"><div class="label">Документы с полной проверкой</div><div class="value">{verified} / {len(ENTRIES)}</div></div><div class="stat"><div class="label">Ожидают рецензента</div><div class="value">{pending}</div></div><div class="stat"><div class="label">Записи проверки тезисов</div><div class="value">{len(ledger["records"])}</div></div></div>'
 text+='<p class="muted editorial-scope">Указанные в карточке материала источники — исходные рекомендации, а не доказательство того, что каждый тезис сверен. Проверка фиксируется отдельно для конкретного тезиса, источника, даты, охвата и ответственного рецензента. Правовые и платформенные правила требуют профильной проверки на указанную дату.</p>'
 source_ids={source['id'] for source in SOURCES}
 for module in sorted((entry for entry in ENTRIES.values() if entry['kind']=='module'),key=lambda entry:entry['module']):
  documents=sorted((entry for entry in ENTRIES.values() if entry['module']==module['module']),key=lambda entry:(entry['kind']!='module',entry['id']))
  module_reviews=sum(len(reviews_by_document.get(entry['id'],[])) for entry in documents)
  wait=sum(entry['status']!='verified' for entry in documents)
  text+=f'<details class="editorial-module"><summary><span>{h(module["module"])} · {h(module["title"])}</span><span class="badge">{wait} ожидают · {module_reviews} записей</span></summary><div class="table-wrap" role="group" tabindex="0" aria-label="Материалы модуля {h(module["module"])}. Используйте горизонтальную прокрутку, чтобы увидеть все столбцы."><table class="editorial-table"><thead><tr><th scope="col">Материал</th><th scope="col">Указанные источники</th><th scope="col">Статус</th><th scope="col">Рецензент</th><th scope="col">Дата и scope проверки</th></tr></thead><tbody>'
  for entry in documents:
   route_path=route(entry)
   records=reviews_by_document.get(entry['id'],[])
   source_refs=''.join(f'<a class="source-ref" href="{link("source/"+sid+"/",1)}">{h(sid)}</a>' for sid in entry['sources'] if sid in source_ids) or '<span class="muted">Не указаны</span>'
   source_refs+='<span class="small muted source-ref-note">Не подтверждают тезисы без записи проверки</span>'
   status='<span class="badge ok">Проверен</span>' if entry['status']=='verified' else '<span class="badge warning">Ожидает проверки</span>'
   reviewers=''.join(f'<span class="review-record">{h(record["reviewer"])}<span class="small muted">{h(record["reviewerRole"])}</span></span>' for record in records) or '<span class="muted">Не назначен</span>'
   checks=''.join(f'<span class="review-record">{h(record["checkedOn"])} · {"весь документ" if record["coverage"]=="full_document" else "выбранные тезисы"}<span class="small muted">{h(record["scope"])}</span></span>' for record in records) or '<span class="muted">Нет записи</span>'
   text+=f'<tr><th scope="row"><a href="{link(route_path,1)}">{h(entry["id"])} · {h(entry["title"])}</a></th><td>{source_refs}</td><td>{status}</td><td>{reviewers}</td><td>{checks}</td></tr>'
  text+='</tbody></table></div></details>'
 text+='<a class="btn" href="../library/">← Ко всем справочникам</a>'
 return page_shell(text,'Готовность материалов',1,'library')

def build_pages(output_dir=DEFAULT_OUT):
 out=pathlib.Path(output_dir)
 if not out.is_absolute():out=ROOT/out
 out=out.resolve()
 if out!=DEFAULT_OUT.resolve():raise ValueError(f'Output directory must be the dedicated fallback path {DEFAULT_OUT}: {out}')
 if out.exists():shutil.rmtree(out)
 (out/'assets').mkdir(parents=True)
 for file,dest in [('src/styles/app.css','assets/app.css'),('src/scripts/user-store.js','assets/user-store.js'),('src/scripts/app.js','assets/app.js'),('src/scripts/practice-feedback.js','assets/practice-feedback.js'),('src/scripts/trainer-core.js','assets/trainer-core.js'),('src/scripts/trainer.js','assets/trainer.js'),('src/scripts/today-core.js','assets/today-core.js'),('src/scripts/today.js','assets/today.js')]:shutil.copy2(ROOT/file,out/dest)
 shutil.copy2(ROOT/'src/generated/client-index.json',out/'assets/client-index.json')
 for asset_dir in ('brand','fonts'):
  source_dir=ROOT/'public'/'assets'/asset_dir
  if not source_dir.is_dir():raise FileNotFoundError(f'Required Sales OS {asset_dir} assets are missing: {source_dir}')
  shutil.copytree(source_dir,out/'assets'/asset_dir)
 def save(path,markup):
  if path.endswith('.html') and path!='404.html':
   route='/' if path=='index.html' else '/'+path[:-len('index.html')] if path.endswith('/index.html') else None
   is_private=route is not None and any(route.startswith(f'/{section}/') for section in ('settings','bookmarks','review','search','today'))
   if route is not None and not is_private:
    canonical=urljoin(SITE_URL+'/',route.lstrip('/'))
    soup=BeautifulSoup(markup,'html.parser')
    if soup.head and not soup.head.select_one('link[rel="canonical"]'):
     tag=soup.new_tag('link',rel='canonical',href=canonical);soup.head.append(tag)
    if soup.head and not soup.head.select_one('meta[property="og:url"]'):
     tag=soup.new_tag('meta',property='og:url',content=canonical);soup.head.append(tag)
    markup=str(soup)
  full=out/path;full.parent.mkdir(parents=True,exist_ok=True);full.write_text(markup,encoding='utf-8')
 for scenario in SCENARIOS:
  save(f'trainer/{scenario["id"]}/index.html',page_shell(render_trainer(SCENARIOS,scenario['id']),scenario['title'],2,'trainer'))
 save('today/index.html',page_shell(render_today(ENTRIES),'Занятие на сегодня',1,'today'))
 save('trainer/index.html',page_shell(render_trainer(SCENARIOS),'Тренажёр переписки',1,'trainer'))
 # Home
 st=f'<div class="eyebrow">ПЕРСОНАЛЬНАЯ СИСТЕМА ОБУЧЕНИЯ</div><h1 class="h1">Продажи. От понимания — к практике.</h1><p class="intro">Структурированная база знаний для работы с клиентами через переписку: 22 модуля, теория, упражнения и реальные проекты. Изучайте по порядку и сохраняйте свой прогресс.</p>'
 st+='<div class="stat-grid"><div class="stat"><div class="label">Пройдено теории</div><div class="value" data-global-theory>0 / 336</div><div class="label">336 уроков</div></div><div class="stat"><div class="label">Практика</div><div class="value" data-global-practice>0 / 72</div><div class="label">72 задания</div></div><div class="stat"><div class="label">Общий прогресс</div><div class="value" data-global-pct>0%</div><div class="progress" role="progressbar" aria-label="Общий прогресс обучения" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0%" data-global-progress><span data-global-fill></span></div></div></div>'
 st+='<section class="next-steps" aria-label="Следующие шаги обучения"><div class="dash-hero return-step" data-return-card hidden><div class="eyebrow">ПОСЛЕДНИЙ ОТКРЫТЫЙ МАТЕРИАЛ</div><h2 data-return-title>Ваш последний материал</h2><p>Вернитесь туда, где вы остановились.</p><a data-return class="btn" href="lesson/01-001/">Вернуться к материалу →</a></div><div class="dash-hero program-step"><div class="eyebrow">ПРОГРАММА · ПО ПОРЯДКУ</div><h2 data-program-title>Начните с основ продаж</h2><p data-program-description>Сначала разберите обязательные темы, затем закрепите их практикой. Продвинутые материалы доступны в любой момент.</p><a data-continue class="btn primary" href="lesson/01-001/">Начать программу →</a></div></section>'
 st+='<section class="today-home" aria-labelledby="today-home-title"><div><h2 class="h2" id="today-home-title">Занятие на сегодня</h2><p>10, 20 или 40 минут: небольшой план с повторением, новым материалом и шагом практики.</p></div><form class="today-home-form" action="today/" method="get"><label>Время<select name="budget" aria-label="Время занятия"><option value="10">10 минут</option><option value="20" selected>20 минут</option><option value="40">40 минут</option></select></label><label>Цель (необязательно)<select name="goal" aria-label="Цель занятия"><option value="any">Без отдельной цели</option><option value="foundation">Основы продаж</option><option value="conversation">Переписка с клиентом</option><option value="pricing">Цена и предложение</option></select></label><button class="btn primary" type="submit">Начать занятие</button><a href="today/">Продолжить сохранённое</a></form></section>'
 stats=BeautifulSoup(st,'html.parser');counter=stats.select_one('.stat-grid');counter.extract();stats.select_one('.next-steps').insert_after(counter);st=str(stats)
 pending=sum(e['status']!='verified' for e in ENTRIES.values())
 st+=f'<section class="home-resources" aria-label="Справочные материалы"><a href="library/">Глоссарий, кейсы и шаблоны <span>Открыть справочники →</span></a><a href="editorial-review/">Готовность материалов <span>{pending} документов ожидают рецензента →</span></a></section>'
 st+='<div class="section-head"><h2 class="h2">Ваш путь обучения</h2><a href="roadmap/" class="small muted">Все 22 модуля →</a></div>'
 for s in STAGES:
  st+=f'<div class="level-head"><h2>0{s["id"]}. {h(s["title"])}</h2><a class="small muted" href="level/{s["id"]}/">Перейти к уровню →</a></div><div class="grid">'+''.join(intro_card(e,0) for e in STAGE_GROUPS[s['id']][:2])+'</div>'
 save('index.html',page_shell(st,'Главная',0,'home'))
 # Roadmap
 text=breadcrumb([('Обзор',''),('Roadmap',None)],1)+header('ОБУЧЕНИЕ · 4 УРОВНЯ','Дорожная карта продаж','Все направления обучения на одном экране. Выберите модуль — откроются только его материалы.')
 text+='<section class="notice project-callout" aria-labelledby="roadmap-project-title"><h2 id="roadmap-project-title">Примените навыки в итоговом проекте</h2><p>Соберите учебный маршрут в один результат: от выбора ниши до плана выполнения и ретроспективы. Начать можно с симуляции, не дожидаясь реальной сделки.</p><a class="btn smallbtn" href="../final-project/">Открыть итоговый проект →</a></section>'
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
 text+='<section class="notice project-callout" aria-labelledby="practice-project-title"><h2 id="practice-project-title">Сквозной итоговый проект</h2><p>Соберите путь от выбора ниши и исследования клиентов до оффера, переговоров и ретроспективы. Если реальной сделки пока нет, проект можно пройти как учебную симуляцию.</p><a class="btn smallbtn" href="../final-project/">Открыть итоговый проект →</a></section>'
 text+='<div class="filter-row"><label><span class="small muted">Модуль </span><select data-filter="module"><option value="">Все модули</option>'+''.join(f'<option value="{e["module"]}">{e["module"]} · {h(e["title"])}</option>' for e in ENTRIES.values() if e['kind']=='module')+'</select></label><label><span class="small muted">Категория изучения </span><select data-filter="level"><option value="">Любой</option><option value="required">Обязательные</option><option value="advanced">Продвинутые</option></select></label><span class="badge" role="status" aria-live="polite">Показано <span data-filter-count>72</span> из 72 заданий</span></div><div class="notice" data-filter-empty hidden>По выбранным фильтрам заданий нет. <button class="btn smallbtn" type="button" data-filter-reset>Сбросить фильтры</button></div><div class="stack">'
 text+=''.join(f'<div data-filter-item data-mod="{e["module"]}" data-level="{e["level"]}">{list_item(e,1)}</div>' for e in practice)+'</div>'
 save('practice/index.html',page_shell(text,'Практика',1,'practice'))
 # Sources
 kinds={'BOOKS':'Книги','VIDEOS':'Видео','COURSES':'Курсы','STUDIES':'Исследования','GUIDES_AND_LAWS':'Справочники и правила'}
 text=breadcrumb([('Обзор',''),('Источники',None)],1)+header('БИБЛИОТЕКА','Источники знаний','Книги, исследования, открытые курсы и видео. Ссылки предоставлены из каталога курса; независимая редакционная проверка каждого материала не завершена.')
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
  text+='<div class="notice">Описание и ссылка перенесены из каталога курса. Полная самостоятельная проверка текста, видео или издания не заявляется.</div>'
  text+=f'<article class="article source-content" data-pagefind-body data-search-id="{s["id"]}" data-search-level="extra" data-search-module="extra" data-search-kind="source" data-pagefind-filter="level[data-search-level], module[data-search-module], kind[data-search-kind]" data-pagefind-meta="id[data-search-id], level[data-search-level], module[data-search-module], kind[data-search-kind]"><p class="small muted">{h(s.get("author", ""))} · {h(kinds.get(s.get("type", ""), "Источник"))}</p>'
  if s.get('description'):text+='<p class="intro">'+h(s['description'])+'</p>'
  text+='</article>'
  url=s.get('url')
  if url and urlparse(url).scheme in ('http','https'):text+=f'<p><a href="{h(url)}" target="_blank" rel="noopener noreferrer" class="btn primary">Открыть первоисточник ↗</a></p>'
  connected=[x for x in ENTRIES.values() if s['id'] in x['sources'] and x['kind']=='theory']
  text+=f'<div class="section-head"><h2 class="h2">Связанные уроки</h2><span class="badge">{len(connected)}</span></div><div class="stack">'+''.join(list_item(e,2) for e in connected[:80])+'</div>'
  if len(connected)>80:text+='<p class="pill-note">Показаны первые 80 уроков.</p>'
  save(f'source/{s["id"]}/index.html',page_shell(text,s['title'],2,'sources'))
 # Existing reference libraries and the claim-level editorial readiness map.
 text=breadcrumb([('Обзор',''),('Справочники',None)],1)+header('СПРАВОЧНЫЕ МАТЕРИАЛЫ','Библиотека курса','Термины, учебные ситуации и рабочие заготовки — рядом с учебным маршрутом и поиском.')
 text+='<div class="library-card-grid">'
 for identifier,(title,description,_,_) in LIBRARIES.items():
  text+=f'<a class="card library-card" href="{link("library/"+identifier+"/",1)}"><span class="badge">Справочник</span><h2>{h(title)}</h2><p>{h(description)}</p><span class="small muted">Открыть →</span></a>'
 text+='</div>'
 pending=sum(e['status']!='verified' for e in ENTRIES.values())
 text+=f'<section class="notice editorial-notice" aria-labelledby="editorial-readiness-title"><div><strong id="editorial-readiness-title">Редакторская готовность курса</strong><p>Все {len(ENTRIES)} основных документов пока имеют статус редакционного черновика. Источники и состояние проверки можно сверить по материалам.</p></div><a class="btn smallbtn" href="{link("editorial-review/",1)}">Открыть карту проверки →</a></section>'
 save('library/index.html',page_shell(text,'Справочники',1,'library'))
 for identifier in LIBRARIES:save(f'library/{identifier}/index.html',render_library(identifier))
 ledger=json.loads((CONTENT/'editorial-review-ledger.json').read_text(encoding='utf-8'))
 reviews_by_document=collections.defaultdict(list)
 for record in ledger['records']:reviews_by_document[record['documentId']].append(record)
 verified=len(ENTRIES)-pending
 text=breadcrumb([('Обзор',''),('Справочники','library/'),('Готовность материалов',None)],1)+header('РЕДАКТОРСКАЯ ПРИЁМКА','Готовность материалов',f'Проверяемая карта редакционного статуса {len(ENTRIES)} основных материалов курса.')
 text+=f'<section class="notice editorial-notice" aria-labelledby="editorial-status-title"><div><strong id="editorial-status-title">Редакторская проверка не завершена</strong><p>{verified} из {len(ENTRIES)} документов имеют запись полной редакторской проверки; {pending} ожидают рецензента. Технические проверки не снимают статус черновика.</p></div></section>'
 text+=f'<div class="stat-grid editorial-summary" aria-label="Сводка редакционной проверки"><div class="stat"><div class="label">Документы с полной проверкой</div><div class="value">{verified} / {len(ENTRIES)}</div></div><div class="stat"><div class="label">Ожидают рецензента</div><div class="value">{pending}</div></div><div class="stat"><div class="label">Записи проверки тезисов</div><div class="value">{len(ledger["records"])}</div></div></div>'
 text+='<p class="muted editorial-scope">Указанные в карточке материала источники — исходные рекомендации, а не доказательство того, что каждый тезис сверен. Проверка фиксируется отдельно для конкретного тезиса, источника, даты, охвата и ответственного рецензента. Правовые и платформенные правила требуют профильной проверки на указанную дату.</p>'
 source_ids={source['id'] for source in SOURCES}
 for module in sorted((entry for entry in ENTRIES.values() if entry['kind']=='module'),key=lambda entry:entry['module']):
  documents=sorted((entry for entry in ENTRIES.values() if entry['module']==module['module']),key=lambda entry:(entry['kind']!='module',entry['id']))
  module_reviews=sum(len(reviews_by_document.get(entry['id'],[])) for entry in documents)
  wait=sum(entry['status']!='verified' for entry in documents)
  text+=f'<details class="editorial-module"><summary><span>{h(module["module"])} · {h(module["title"])}</span><span class="badge">{wait} ожидают · {module_reviews} записей</span></summary><div class="table-wrap" role="group" tabindex="0" aria-label="Материалы модуля {h(module["module"])}. Используйте горизонтальную прокрутку, чтобы увидеть все столбцы."><table class="editorial-table"><thead><tr><th scope="col">Материал</th><th scope="col">Указанные источники</th><th scope="col">Статус</th><th scope="col">Рецензент</th><th scope="col">Дата и scope проверки</th></tr></thead><tbody>'
  for entry in documents:
   records=reviews_by_document.get(entry['id'],[])
   source_refs=''.join(f'<a class="source-ref" href="{link("source/"+sid+"/",1)}">{h(sid)}</a>' for sid in entry['sources'] if sid in source_ids) or '<span class="muted">Не указаны</span>'
   source_refs+='<span class="small muted source-ref-note">Не подтверждают тезисы без записи проверки</span>'
   status='<span class="badge ok">Проверен</span>' if entry['status']=='verified' else '<span class="badge warning">Ожидает проверки</span>'
   reviewers=''.join(f'<span class="review-record">{h(record["reviewer"])}<span class="small muted">{h(record["reviewerRole"])}</span></span>' for record in records) or '<span class="muted">Не назначен</span>'
   checks=''.join(f'<span class="review-record">{h(record["checkedOn"])} · {"весь документ" if record["coverage"]=="full_document" else "выбранные тезисы"}<span class="small muted">{h(record["scope"])}</span></span>' for record in records) or '<span class="muted">Нет записи</span>'
   text+=f'<tr><th scope="row"><a href="{link(route(entry),1)}">{h(entry["id"])} · {h(entry["title"])}</a></th><td>{source_refs}</td><td>{status}</td><td>{reviewers}</td><td>{checks}</td></tr>'
  text+='</tbody></table></div></details>'
 text+='<a class="btn" href="../library/">← Ко всем справочникам</a>'
 save('editorial-review/index.html',page_shell(text,'Готовность материалов',1,'library'))
 # Saved
 text=breadcrumb([('Обзор',''),('Закладки',None)],1)+header('ЛИЧНАЯ БИБЛИОТЕКА','Закладки','Сохранённые уроки и упражнения. Все данные остаются в браузере.')+'<section data-bookmark-results role="region" aria-label="Закладки" aria-busy="true"><div class="notice" data-bookmark-status role="status" aria-live="polite" aria-atomic="true">Загрузка закладок…</div><div class="stack" data-bookmark-list></div></section>'
 save('bookmarks/index.html',page_shell(text,'Закладки',1,'bookmarks'))
 # Search
 text=breadcrumb([('Обзор',''),('Поиск',None)],1)+header('ПОИСК ПО КУРСУ','Найти материал','Единый поиск по курсу, итоговому проекту, справочникам и карточкам источников.')
 text+='<div class="search-controls"><label class="small muted" for="search-input">Поисковый запрос</label><input class="search-field" id="search-input" name="q" type="search" data-search-input autocomplete="off" placeholder="Например, возражения, SPIN, обмен ценностью"/><div class="search-filters" aria-label="Фильтры результатов"><label><span>Категория изучения</span><select class="status-select" data-search-level aria-label="Фильтр по категории изучения"><option value="">Любой</option><option value="required">Обязательный</option><option value="advanced">Продвинутый</option><option value="extra">Дополнительные материалы</option></select></label><label><span>Модуль</span><select class="status-select" data-search-module aria-label="Фильтр по модулю"><option value="">Все модули</option>'+''.join(f'<option value="{m["module"]}">{m["module"]} · {h(m["title"])}</option>' for m in sorted((e for e in ENTRIES.values() if e["kind"]=="module"),key=lambda e:e["module"]))+'<option value="extra">Без модуля</option></select></label><label><span>Тип</span><select class="status-select" data-search-kind aria-label="Фильтр по типу материала"><option value="">Все типы</option><option value="theory">Теория</option><option value="practice">Практика</option><option value="module">Глава модуля</option><option value="final_project">Итоговый проект</option><option value="library">Справочник</option><option value="source">Источник</option></select></label></div><label class="search-private"><input type="checkbox" data-search-private/><span><strong>Искать в моих заметках, ответах и закладках</strong><span>Только локально на этом устройстве. Поисковая фраза не добавляется в адрес страницы.</span></span></label></div><div class="notice search-status" data-search-status role="status" aria-live="polite" aria-atomic="true" aria-busy="true">Загрузка поиска…</div><div class="stack search-results" data-search-results role="region" aria-label="Результаты поиска" aria-busy="true"></div><button class="btn" type="button" data-search-more hidden>Показать ещё</button>'
 save('search/index.html',page_shell(text,'Поиск',1,'search'))
 # Final project
 final_path=CONTENT/'FINAL_PROJECT.md'
 raw=final_path.read_text(encoding='utf-8')
 markup=MarkdownIt('default',{'html':False}).enable('table').render(raw)
 soup=BeautifulSoup(markup,'html.parser')
 if soup.h1:soup.h1.decompose()
 for t in soup.select('table'):
  annotate_table(t)
  t.wrap(soup.new_tag('div',attrs={'class':'table-wrap','role':'group','tabindex':'0','aria-label':'Широкая таблица. Используйте горизонтальную прокрутку, чтобы увидеть все столбцы.'}))
 text=breadcrumb([('Практика','practice/'),('Итоговый проект',None)],1)+header('СКВОЗНАЯ ПРАКТИКА','От первого клиента до сделки','Практический маршрут, объединяющий навыки из разных модулей. Если реальной сделки пока нет, пройдите его как учебную симуляцию.')+'<a class="btn primary" href="#workspace-FINAL_PROJECT">Перейти к этапам проекта</a><article class="article prose" data-pagefind-body data-search-id="FINAL_PROJECT" data-search-level="extra" data-search-module="extra" data-search-kind="final_project" data-pagefind-filter="level[data-search-level], module[data-search-module], kind[data-search-kind]" data-pagefind-meta="id[data-search-id], level[data-search-level], module[data-search-module], kind[data-search-kind]">'+str(soup)+'</article>'+practice_workspace({'id':'FINAL_PROJECT','title':'От первого клиента до сделки'})+'<div class="editbox"><strong>Мои прежние заметки и общий обзор проекта</strong><textarea data-note="FINAL_PROJECT" aria-label="Заметки итогового проекта" placeholder="Цели, результаты, ссылки на документы и выводы..."></textarea><p class="hint" data-save-hint>Данные остаются в браузере</p></div>'
 save('final-project/index.html',page_shell(text,'Итоговый проект',1,'practice'))
 # Review queue
 text=breadcrumb([('Обзор',''),('Очередь повтора',None)],1)+header('ВОЗВРАТ К МАТЕРИАЛАМ','Очередь повтора','Вы сами выбираете, когда вернуться. Перед открытием материала попробуйте сначала вспомнить основную мысль.')
 text+='<p class="notice">Без серий и баллов: запись остаётся в очереди, пока вы сами не отметите её просмотренной или не перенесёте.</p><section class="review-queue" data-review-queue aria-busy="true" aria-live="polite"><div class="review-queue-group" data-review-due-group hidden><div class="section-head"><h2 class="h2">Пора вернуться</h2><span class="badge" data-review-due-count></span></div><div class="stack" data-review-due-list></div></div><div class="review-queue-group" data-review-upcoming-group hidden><div class="section-head"><h2 class="h2">Запланировано позже</h2></div><div class="stack" data-review-upcoming-list></div></div><div class="notice" data-review-empty hidden><h2 class="h2">Очередь пока пуста</h2><p>На уроке или задании выберите «Вернуться позже», чтобы запланировать повторение.</p><a class="btn primary" href="../roadmap/">Открыть программу</a></div><p class="notice" data-review-error hidden role="status">Не удалось загрузить очередь. Проверьте локальное хранилище и обновите страницу.</p></section>'
 save('review/index.html',page_shell(text,'Очередь повтора',1,'review',description='Просматривайте запланированные уроки, вспоминайте основную мысль и переносите дату повтора. Очередь хранится в этом браузере.'))
 # Settings
 text=breadcrumb([('Обзор',''),('Настройки',None)],1)+header('ПРИЛОЖЕНИЕ','Настройки и данные','Все ответы, заметки и прогресс хранятся локально. Регистрация и сервер не требуются.')
 text+='<div class="settings-row"><div><strong>Цветовая тема</strong><p>Автоматическая, светлая или тёмная</p></div><select class="theme-switch" data-theme-select aria-label="Цветовая тема"><option value="system">Системная</option><option value="light">Светлая</option><option value="dark">Тёмная</option></select></div>'
 text+='<section class="backup-center" aria-labelledby="backup-center-title"><div class="section-head"><div><span class="eyebrow">ЛОКАЛЬНЫЕ ДАННЫЕ</span><h2 class="h2" id="backup-center-title">Центр резервных копий</h2></div></div><p class="muted">Копия включает статусы, заметки, структурированные ответы, историю итераций и очередь повтора. Сам файл скачивается на ваше устройство; сохранённые точки восстановления доступны только в этом браузере.</p><p class="backup-last-export" data-backup-last-export role="status" aria-live="polite">Проверяем историю экспорта…</p><div class="settings-row"><div><strong>Экспорт</strong><p>Создать переносимую копию данных Sales OS в формате JSON.</p></div><button class="btn primary" type="button" data-export>Скачать резервную копию</button></div><div class="settings-row"><div><strong>Импорт</strong><p>Принимаются старый Sales OS v1, резервные копии v2 и полный формат v3.</p></div><label class="btn import-file">Выбрать файл<input data-import type="file" accept=".json,application/json" aria-label="Выбрать JSON-файл для импорта"/></label></div><section class="restore-points" aria-labelledby="restore-points-title"><h3 id="restore-points-title">Точки восстановления этого браузера</h3><p class="small muted">Перед заменой или объединением приложение сохраняет текущие данные. Восстановление также создаёт новую точку, чтобы можно было отменить это действие.</p><p class="muted" data-restore-empty>Пока нет локальных точек восстановления.</p><ul data-restore-points hidden aria-label="Доступные точки восстановления"></ul></section></section>'
 text+='<div class="notice">Импорт не подтверждает владение навыком. Самопроверка и отметки выполнения остаются личными записями пользователя.</div>'
 text+='<section class="offline-manager" aria-labelledby="offline-title"><div class="section-head"><h2 class="h2" id="offline-title">Офлайн-пакет</h2></div><p class="muted">Полный учебный корпус сохраняется в кэш этого браузера. Установка продолжается после ошибки с повтором недостающих файлов; личные записи остаются в локальном хранилище.</p><div class="offline-summary" data-offline-summary aria-live="polite"><span data-offline-status>Проверяем доступность пакета…</span><span data-offline-meta></span></div><progress class="offline-progress" data-offline-progress max="1" value="0" aria-label="Загрузка офлайн-пакета" hidden></progress><div class="offline-actions"><button class="btn primary" type="button" data-offline-install disabled>Загрузить офлайн-пакет</button><button class="btn" type="button" data-offline-cancel hidden>Отменить загрузку</button><button class="btn" type="button" data-offline-clear disabled>Удалить офлайн-пакет</button></div><p class="small muted" data-offline-storage></p><details class="offline-modules"><summary data-offline-module-summary>Состав пакета</summary><ul data-offline-modules></ul></details><section class="offline-failures" data-offline-failures hidden aria-labelledby="offline-failures-title"><h3 id="offline-failures-title">Недоступные ресурсы</h3><p>Пакет неполный. Повтор загрузки проверит и добавит только отсутствующие материалы.</p><ul></ul></section></section>'
 text+='<dialog class="data-dialog" data-import-dialog aria-labelledby="import-dialog-title"><div class="data-dialog-content"><span class="eyebrow">ПРЕДВАРИТЕЛЬНЫЙ ПРОСМОТР</span><h2 id="import-dialog-title">Данные в выбранном файле</h2><p data-import-file-meta></p><ul data-import-preview></ul><div class="import-choice"><strong>Объединить</strong><p>Сохранит локальные и импортируемые статусы, закладки, историю и очередь. Повторяющиеся итерации объединятся по ID; разные заметки сохранятся отдельными блоками. Черновики останутся доступными как варианты.</p></div><div class="import-choice"><strong>Заменить</strong><p>Заменит локальное состояние данными файла. Перед действием будет создана точка восстановления на этом устройстве.</p></div><div class="data-dialog-actions"><button class="btn" type="button" data-import-cancel>Отмена</button><button class="btn" type="button" data-import-merge>Объединить данные</button><button class="btn primary" type="button" data-import-replace>Заменить после резервирования</button></div></div></dialog><dialog class="data-dialog" data-restore-dialog aria-labelledby="restore-dialog-title"><div class="data-dialog-content"><span class="eyebrow">ЛОКАЛЬНОЕ ВОССТАНОВЛЕНИЕ</span><h2 id="restore-dialog-title">Восстановить эту версию?</h2><p>Текущее состояние сначала сохранится в новой точке восстановления. После успешного восстановления страница перезагрузится.</p><div class="data-dialog-actions"><button class="btn" type="button" data-restore-cancel>Отмена</button><button class="btn primary" type="button" data-restore-confirm>Восстановить данные</button></div></div></dialog>'
 save('settings/index.html',page_shell(text,'Настройки',1,'settings',description='Управляйте локальными резервными копиями, импортом данных, цветовой темой и офлайн-пакетом Sales OS.'))
 # 404
 save('404.html',page_shell(header('ОШИБКА 404','Страница не найдена','Проверьте адрес или вернитесь к карте знаний.')+'<a class="btn primary" href="./roadmap/">К roadmap →</a>','Не найдено',0))
 # Search index full text for actual searchable content, is loaded only on search route
 index=[]
 for e in ENTRIES.values():
  raw=(CONTENT/e['path']).read_text(encoding='utf-8').split('---',2)[2]
  raw=re.sub(r'^## (?:\d+\. )?(?:Материалы для углубления|Источники для проверки[^\n]*|Рекомендуемые материалы)[\s\S]*?(?=^## |\Z)', '', raw, flags=re.M)
  text=re.sub(r'\[([^]]+)\]\([^)]*\)',r'\1',raw)
  if e['id'] in GUIDES:text+=' '+BeautifulSoup(render_feedback(e['id'],GUIDES),'html.parser').select_one('.practice-feedback').get_text(' ',strip=True)
  index.append({'id':e['id'],'kind':e['kind'],'level':e['level'],'module':e['module'],'title':e['title'],'url':f'{route(e)}','text':text})
 for identifier,(title,_,_,filename) in LIBRARIES.items():
  raw=(CONTENT/filename).read_text(encoding='utf-8').split('---',2)[2]
  raw=re.sub(r'^## (?:\d+\. )?(?:Материалы для углубления|Источники для проверки[^\n]*|Рекомендуемые материалы)[\s\S]*?(?=^## |\Z)', '', raw, flags=re.M)
  text=re.sub(r'\[([^]]+)\]\([^)]*\)',r'\1',raw)
  index.append({'id':identifier,'kind':'library','level':'extra','module':'extra','title':title,'url':f'library/{identifier}/','text':text})
 final_raw=(CONTENT/'FINAL_PROJECT.md').read_text(encoding='utf-8')
 final_text=re.sub(r'\[([^]]+)\]\([^)]*\)',r'\1',final_raw)
 index.append({'id':'FINAL_PROJECT','kind':'final_project','level':'extra','module':'extra','title':'От первого клиента до сделки','url':'final-project/','text':final_text})
 for source in SOURCES:
  source_text=' '.join(part for part in (source['id'],source['title'],source.get('author',''),source.get('description',''),source.get('type','')) if part)
  index.append({'id':source['id'],'kind':'source','level':'extra','module':'extra','title':source['title'],'url':f'source/{source["id"]}/','text':source_text})
 save('assets/search-index.json',json.dumps(index,ensure_ascii=False,separators=(',',':')))
 # Manifest + offline installation list
 save('manifest.webmanifest',json.dumps({'name':'Sales OS — база знаний по продажам','short_name':'Sales OS','lang':'ru','start_url':'./','display':'standalone','background_color':'#ffffff','theme_color':'#000000','icons':[{'src':'assets/brand/app-icon-192.png','sizes':'192x192','type':'image/png','purpose':'any'},{'src':'assets/brand/app-icon-512.png','sizes':'512x512','type':'image/png','purpose':'any'},{'src':'assets/brand/app-icon-512-maskable.png','sizes':'512x512','type':'image/png','purpose':'maskable'}]},ensure_ascii=False))
 save('sw.js',(ROOT/'scripts/service-worker.js').read_text(encoding='utf-8'))
 resources=[]
 fingerprint=hashlib.sha256()
 for file in sorted((item for item in out.rglob('*') if item.is_file() and item.name!='assets/offline-files.json'),key=lambda item:item.relative_to(out).as_posix()):
  relative=file.relative_to(out).as_posix()
  content=file.read_bytes()
  fingerprint.update(relative.encode('utf-8')+b'\0'+content+b'\0')
  if relative=='sw.js':continue
  if relative.endswith('/index.html') or relative=='index.html':
   parent=pathlib.PurePosixPath(relative).parent
   url='' if str(parent)=='.' else parent.as_posix()+'/'
  else:url=relative
  resources.append({'url':url,'bytes':len(content)})
 resources.append({'url':'assets/offline-files.json','bytes':0})
 urls=sorted({resource['url'] for resource in resources})
 resources.sort(key=lambda resource:resource['url'])
 module_list=[{'id':entry['module'],'title':entry['title'],'url':f'module/{entry["id"]}/'} for entry in ENTRIES.values() if entry['kind']=='module']
 version=fingerprint.hexdigest()[:12]
 offline={'schemaVersion':2,'version':version,'estimatedBytes':sum(resource['bytes'] for resource in resources),'modules':module_list,'resources':resources,'urls':[resource['url'] for resource in resources]}
 save('assets/offline-files.json',json.dumps(offline,ensure_ascii=False,separators=(',',':')))
 # sitemap useful for generated static hosting
 urls_count=len(list(out.rglob('index.html')))
 print('PASS: rendered',urls_count,'HTML documents; full-corpus search records',len(index),'offline resources',len(resources),'build hash',version)
 return {'html':urls_count,'offline':len(resources),'search':len(index)}

if __name__=='__main__':
 import argparse
 parser=argparse.ArgumentParser(description='Build the standalone Python fallback site.')
 parser.add_argument('--out-dir',default=str(DEFAULT_OUT),help='Output directory inside the project (default: dist-fallback)')
 args=parser.parse_args()
 build_pages(args.out_dir)
