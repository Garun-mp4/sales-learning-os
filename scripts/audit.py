#!/usr/bin/env python3
import json, yaml, re, pathlib, hashlib, collections, os
ROOT=pathlib.Path(__file__).resolve().parents[1]
CONTENT=ROOT/'sales-knowledge-base'
def write_if_changed(path, content):
    encoded=json.dumps(content,ensure_ascii=False,indent=2).encode('utf-8') if path.name=='content-manifest.json' else json.dumps(content,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    if path.is_file() and path.read_bytes()==encoded:return
    temporary=path.with_name(f'.{path.name}.{os.getpid()}.tmp')
    try:
        temporary.write_bytes(encoded);os.replace(temporary,path)
    finally:
        temporary.unlink(missing_ok=True)
legacy=json.loads((ROOT/'src/generated/legacy.json').read_text(encoding='utf-8'))
entries={}; issues=[]; path_ids={}; legacy_map={}; stats=collections.Counter()
for path in sorted((CONTENT/'modules').rglob('*.md')):
    raw=path.read_text(encoding='utf-8'); parts=raw.split('---',2)
    if len(parts)<3 or parts[0].strip(): issues.append(f'Missing frontmatter {path}');continue
    meta=yaml.safe_load(parts[1]); body=parts[2].strip()
    key=meta.get('id');kind=meta.get('kind'); stats[kind]+=1
    if key in entries: issues.append(f'Duplicate ID {key}')
    if kind not in ('module','theory','practice'): issues.append(f'Bad kind {key}')
    if not all(k in meta for k in ('id','title','module','kind','level','group','status','sources','related_practice')): issues.append(f'Missing metadata {key}')
    entries[key]={'id':key,'title':meta['title'],'module':meta['module'],'kind':kind,'level':meta['level'],'group':meta['group'],'status':meta['status'],'sources':meta.get('sources',[]),'related_practice':meta.get('related_practice',[]),'path':path.relative_to(CONTENT).as_posix(),'bodyLength':len(body)}
    path_ids[path.resolve()]=key
all_source_ids=set()
source_items=[]
for sf in sorted((CONTENT/'sources').glob('*.md')):
    body=sf.read_text(encoding='utf-8')
    for match in re.finditer(r'^##\s+([BCSGVLR]\d{2,3})\s*[—-]\s*(.+)$',body,re.M):
        code,title=match.groups()
        if code in all_source_ids: issues.append('Duplicate source '+code)
        all_source_ids.add(code)
        section=body[match.end():].split('\n## ',1)[0]
        url=re.search(r'\*\*URL:\*\*\s*(https?://[^\s)]+)',section)
        author=re.search(r'\*\*Автор / организация:\*\*\s*([^\n]+)',section)
        source_items.append({'id':code,'title':title.strip(),'type':sf.stem,'url':url.group(1) if url else None,'author':author.group(1).strip() if author else None,'description': re.search(r'\*\*Зачем читать:\*\*\s*([^\n]+)',section).group(1).strip() if re.search(r'\*\*Зачем читать:\*\*\s*([^\n]+)',section) else None})
for key,meta in entries.items():
    for s in meta['sources']:
        if s not in all_source_ids: issues.append('Missing source '+s+' at '+key)
    for pid in meta['related_practice']:
        if pid not in entries: issues.append('Missing practice '+pid+' at '+key)
    text=(CONTENT/meta['path']).read_text(encoding='utf-8')
    for href in re.findall(r'\]\(([^)]+)\)',text):
        base=href.split('#',1)[0]
        if not base or base.startswith(('https://','http://','mailto:','#')):continue
        if base.endswith('.md'):
            target=(CONTENT/meta['path']).parent.joinpath(base).resolve()
            if target not in path_ids and not target.exists(): issues.append(f'Broken MD link {key} -> {href}')
for mi,m in enumerate(legacy['modules']):
    md=f'{mi+1:02d}'
    expected=[f'{md}-{i:03d}' for i in range(1,sum(len(x[1]) for x in m['topics'])+1)]
    for ii,id in enumerate(expected):
        if id not in entries:issues.append('Missing expected '+id)
    n=1
    for gi,(group,topics) in enumerate(m['topics']):
        for ti,title in enumerate(topics):
            id=f'{md}-{n:03d}';entry=entries.get(id)
            if entry and (entry['title'].strip()!=title[1:].strip() or entry['group'].strip()!=group.strip()):issues.append(f'Legacy title/group mismatch {id}')
            legacy_map[f't-{mi}-{gi}-{ti}']=id
            if entry: entry['order']=n;entry['stage']=m['stage']
            n+=1
    for pi,lab in enumerate(m['labs']):
        id=f'{md}-P{pi+1:02d}'; legacy_map[f'p-{mi}-{pi}']=id
        if id not in entries:issues.append('Missing legacy practice '+id)
        elif entries[id]['title'].strip()!=lab[0].strip():issues.append('Legacy practice title mismatch '+id)
        if id in entries:entries[id]['order']=pi+1;entries[id]['stage']=m['stage']
    modulekey=md+'-MODULE'
    if modulekey not in entries: issues.append('Module overview missing '+md)
    else:entries[modulekey]['stage']=m['stage'];entries[modulekey]['description']=m['desc'];entries[modulekey]['outcome']=m['outcome'];entries[modulekey]['time']=m['time'];entries[modulekey]['order']=mi+1
for kind,want in [('module',22),('theory',336),('practice',72)]:
    if stats[kind]!=want:issues.append(f'{kind} count {stats[kind]} != {want}')
if len(legacy_map)!=408:issues.append(f'Legacy keys {len(legacy_map)} != 408')
ledger_path=CONTENT/'editorial-review-ledger.json'
try:
    ledger=json.loads(ledger_path.read_text(encoding='utf-8'))
except (OSError,json.JSONDecodeError) as error:
    ledger={'format':None,'records':[]}
    issues.append(f'Editorial review ledger cannot be read: {error}')
if ledger.get('format')!='sales-os-editorial-review-v1' or not isinstance(ledger.get('records'),list):
    issues.append('Editorial review ledger has an unsupported format')
reviews_by_document=collections.defaultdict(list);review_ids=set()
for record in ledger.get('records',[]):
    if not isinstance(record,dict):
        issues.append('Editorial review record must be an object');continue
    required=('recordId','documentId','claimId','claim','sourceIds','checkedOn','scope','reviewer','reviewerRole','coverage','reviewType','status')
    if not all(key in record for key in required):
        issues.append(f'Incomplete editorial review record {record.get("recordId","<unknown>")}');continue
    rid=record['recordId'];document_id=record['documentId'];entry=entries.get(document_id)
    if not isinstance(rid,str) or not rid or rid in review_ids:issues.append(f'Invalid or duplicate editorial review ID {rid}')
    review_ids.add(rid)
    if not entry:issues.append(f'Editorial review references missing document {document_id}');continue
    if not all(isinstance(record[key],str) and record[key].strip() for key in ('claimId','claim','scope','reviewer','reviewerRole')):issues.append(f'Editorial review {rid} has empty claim/review details')
    if not isinstance(record['sourceIds'],list) or not record['sourceIds']:issues.append(f'Editorial review {rid} must link at least one source')
    else:
        for source_id in record['sourceIds']:
            if source_id not in all_source_ids:issues.append(f'Editorial review {rid} references missing source {source_id}')
            if source_id not in entry.get('sources',[]):issues.append(f'Editorial review {rid} source {source_id} is not linked to {document_id}')
    try:datetime.date.fromisoformat(record['checkedOn'])
    except (TypeError,ValueError):issues.append(f'Editorial review {rid} has an invalid checkedOn date')
    if record['coverage'] not in ('selected_claims','full_document'):issues.append(f'Editorial review {rid} has an invalid coverage value')
    if record['reviewType'] not in ('editorial','legal','platform'):issues.append(f'Editorial review {rid} has an invalid reviewType')
    if record['status'] not in ('verified','needs_revision'):issues.append(f'Editorial review {rid} has an invalid status')
    if record['reviewType'] in ('legal','platform') and record['status']=='verified' and record.get('specialistConfirmed') is not True:issues.append(f'Editorial review {rid} needs specialist confirmation')
    reviews_by_document[document_id].append(record)
for document_id,entry in entries.items():
    if entry['status']=='verified':
        records=reviews_by_document.get(document_id,[])
        if not records or not any(record['coverage']=='full_document' for record in records) or any(record['status']!='verified' for record in records):
            issues.append(f'Cannot mark {document_id} verified without complete, clean editorial review records')
if issues:
    for issue in issues[:100]:print('ERROR:',issue)
    raise SystemExit(f'Failed audit with {len(issues)} issues')
manifest={'stages':legacy['stages'],'entries':entries,'legacyMap':legacy_map,'sources':source_items,'editorialReviews':ledger.get('records',[])}
write_if_changed(ROOT/'src/generated/content-manifest.json',manifest)
write_if_changed(ROOT/'src/generated/client-index.json',{'stages':legacy['stages'],'entries':{k:{x:e[x] for x in ['id','title','module','kind','level','order','stage'] if x in e} for k,e in entries.items()},'legacyMap':legacy_map})
print('PASS: modules',stats['module'],'lessons',stats['theory'],'practice',stats['practice'],'source records',len(source_items),'legacy map',len(legacy_map),'links OK')
