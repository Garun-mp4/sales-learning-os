"""User-data integration checks against real HTML + real app.js in an embedded Chromium document.

Localhost traffic is administratively blocked in this runner. These tests exercise
DOM, Storage, JSON import/export, persistence and restore without claiming URL E2E.
"""
from browser_helpers import launch_chromium
from site_helpers import ROOT, SITE
from pathlib import Path
import json,re
from playwright.sync_api import sync_playwright
CSS=(ROOT/'src/styles/app.css').read_text(encoding='utf-8')
JS=(ROOT/'src/scripts/app.js').read_text(encoding='utf-8')
STORE_JS=(ROOT/'src/scripts/projects-core.js').read_text(encoding='utf-8') + '\n' + (ROOT/'src/scripts/knowledge-core.js').read_text(encoding='utf-8') + '\n' + (ROOT/'src/scripts/today-core.js').read_text(encoding='utf-8') + '\n' + (ROOT/'src/scripts/trainer-core.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/scripts/templates-core.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/scripts/highlights-core.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/scripts/user-store.js').read_text(encoding='utf-8')
INDEX=json.loads((SITE/'assets/client-index.json').read_text(encoding='utf-8'))
SEARCH=json.loads((SITE/'assets/search-index.json').read_text(encoding='utf-8'))

def load(page,route,seed=None,delayed_storage=False):
    html=(SITE/route/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<link\b(?=[^>]*\brel=["\']stylesheet["\'])[^>]*>', '<style>'+CSS+'</style>', html)
    html=re.sub(r'<script[^>]*\bsrc="[^"]+"[^>]*></script>', '', html)
    page.set_content(html,wait_until='domcontentloaded')
    page.evaluate('''(v)=>{
      if(!window.__testStorage)window.__testStorage=v.seed||{};
      const map=window.__testStorage;
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>Object.prototype.hasOwnProperty.call(map,k)?map[k]:null,
        setItem:(k,val)=>map[k]=String(val),removeItem:k=>delete map[k],
        key:i=>Object.keys(map)[i],get length(){return Object.keys(map).length}
      }});
      window.fetch=async url=>({ok:true,json:async()=>String(url).includes('client-index')?v.index:v.search});
      window.confirm=()=>true;
      history.replaceState=()=>{};
    }''',{'index':INDEX,'search':SEARCH,'seed':seed or {}})
    page.evaluate('''()=>{const original=window.setTimeout;window.setTimeout=(fn,ms,...args)=>ms===600?0:original(fn,ms,...args);}''')
    if delayed_storage:
      page.evaluate('''()=>{
        Object.defineProperty(window,'indexedDB',{configurable:true,value:{
          open(){const req={error:Error('simulated IDB delay')};
            setTimeout(()=>{req.onerror?.()},270);return req;}
        }});
      }''')
    page.add_script_tag(content=STORE_JS)
    page.add_script_tag(content=JS)

def get_state(page):
    return page.evaluate("JSON.parse(localStorage.getItem('sales-os-v2'))")

def upload_json(page,obj):
    page.locator('[data-import]').set_input_files(files=[{
      'name':'user-progress.json','mimeType':'application/json','buffer':json.dumps(obj,ensure_ascii=False).encode('utf8')
    }]);page.wait_for_timeout(100)
    if page.locator('[data-import-dialog][open]').count():
      page.locator('[data-import-replace]').click()
    page.wait_for_timeout(250)

def main():
    with sync_playwright() as p:
      browser=launch_chromium(p)
      page=browser.new_page()
      load(page,'lesson/01-001')
      page.locator('[data-status-control]').first.select_option('theory_completed')
      page.locator('[data-bookmark]').click()
      page.locator('[data-note]').fill('Мой ответ: первый пример')
      page.wait_for_timeout(800)
      initial=get_state(page)
      assert initial['lessonStatuses']['01-001']=='theory_completed'
      assert initial['bookmarks']==['01-001']
      assert page.evaluate("localStorage.getItem('sales-os-note-01-001')")=='Мой ответ: первый пример'
      persisted=page.evaluate('window.__testStorage')
      page.close()
      page=browser.new_page()
      load(page,'lesson/01-001',persisted)
      page.wait_for_timeout(100)
      assert page.locator('[data-status-control]').first.input_value()=='theory_completed'
      assert page.locator('[data-bookmark]').get_attribute('aria-pressed')=='true'
      assert page.locator('[data-note]').input_value()=='Мой ответ: первый пример'
      print('PASS: lesson status, bookmark and notes restored across HTML document loads')

      # Invalid input must not mutate the existing lesson data or leak oversized import notes.
      persisted=page.evaluate('window.__testStorage')
      page.close()
      page=browser.new_page()
      load(page,'settings',persisted)
      invalid={'format':'sales-os-v2','version':2,'lessonStatuses':{'01-001':'hacked'},
        'practiceStatuses':{},'bookmarks':[],'notes':{'01-001':'invalid'}}
      upload_json(page,invalid)
      assert get_state(page)['lessonStatuses']['01-001']=='theory_completed'
      assert 'Файл не принят' in page.locator('#toast').inner_text()
      print('PASS: tampered backup is rejected before changing current progress')

      # A v2 import replaces old notes and doesn't duplicate notes in localStorage state.
      v2={'format':'sales-os-v2','version':2,'lessonStatuses':{'02-001':'mastered'},
        'practiceStatuses':{'01-P01':'completed'},'bookmarks':['02-001'],
        'lastVisited':'bad-path','notes':{'02-001':'Проверка замены заметок'}}
      upload_json(page,v2)
      saved=get_state(page)
      assert saved['lessonStatuses']=={'02-001':'mastered'}, saved
      assert saved['practiceStatuses']=={'01-P01':'completed'}, saved
      assert saved['bookmarks']==['02-001'], saved
      assert saved['lastVisited'] is None
      assert 'notes' not in saved
      assert page.evaluate("localStorage.getItem('sales-os-note-01-001')") is None
      assert page.evaluate("localStorage.getItem('sales-os-note-02-001')")=='Проверка замены заметок'
      print('PASS: validated v2 import replaces data, removes old notes and avoids duplicated state')

      # v1 migration map has 408 legacy checkboxes; verify representative theory and practice.
      old={'format':'sales-os-roadmap-v1','checks':{'t-0-0-0':True,'p-0-0':True,'t-0-0-1':False},
           'notes':{'0':'Историческая заметка к модулю 01'}}
      upload_json(page,old)
      migrated=get_state(page)
      assert migrated['lessonStatuses'].get('01-001')=='theory_completed'
      assert migrated['practiceStatuses'].get('01-P01')=='self_reviewed'
      assert migrated['legacyImported'] is True
      assert migrated['bookmarks']==[]
      assert page.evaluate("localStorage.getItem('sales-os-note-01-MODULE')")=='Историческая заметка к модулю 01'
      print('PASS: v1 legacy roadmap progress and notes migrated to stable IDs')

      # Previous v7/v8 backups remain importable with newly introduced features empty.
      v7=page.evaluate('''()=>{
        const state=JSON.parse(localStorage.getItem('sales-os-v2'));
        state.format='sales-os-v7';state.version=7;delete state.personalTemplates;
        state.notes={'01-MODULE':localStorage.getItem('sales-os-note-01-MODULE')};
        return state;
      }''')
      upload_json(page,v7)
      assert get_state(page)['personalTemplates']['items']=={}
      print('PASS: v7 backup imports with an empty v8 personal-template library')

      v8=page.evaluate('''()=>{
        const state=JSON.parse(localStorage.getItem('sales-os-v2'));
        state.format='sales-os-v8';state.version=8;
        state.personalTemplates=window.SalesOSTemplates.empty();
        delete state.annotations;
        state.notes={'01-MODULE':localStorage.getItem('sales-os-note-01-MODULE')};
        return state;
      }''')
      upload_json(page,v8)
      assert get_state(page)['annotations']['items']=={}
      print('PASS: v8 backup imports with an empty M7 highlights catalog')

      # Seed personal data from M6 and M7 and verify it survives a v9 backup round trip.
      page.evaluate('''async()=>{
        const store=window.SalesOSUserStore;await store.ready;
        const current=await store.getState();
        const fields={title:'Локальный шаблон',category:'first_message',
          body:'Здравствуйте, {{client}}',tags:['первый контакт','персонализация'],
          whenToUse:'Персональный контакт',resultNote:'',favorite:true,archived:false,source:null};
        const id='11111111-1111-4111-8111-111111111111';
        const versionId='22222222-2222-4222-8222-222222222222';
        let templates=window.SalesOSTemplates.create(current.personalTemplates,fields,Date.now(),id);
        templates.items[id].versions.push({...fields,id:versionId,name:'Базовая версия',createdAt:Date.now()+1});
        templates=window.SalesOSTemplates.validate(templates);
        const docId='01-001';
        const blockId=window.SalesOSHighlights.stableBlockId(docId,['Обмен ценностью'],'Пример локальной цитаты');
        let annotations=window.SalesOSHighlights.create(window.SalesOSHighlights.empty(),{
          documentId:docId,blockIds:[blockId],quote:'Пример локальной цитаты',anchorQuote:'Пример локальной цитаты',
          contextBefore:'',contextAfter:'',textVersion:'1234abcd'
        },'Сохранить только в браузере',Date.now(),'33333333-3333-4333-8333-333333333333');
        const finalBlock=window.SalesOSHighlights.stableBlockId('FINAL_PROJECT',['Этап 1'],'Заметка итогового проекта');
        annotations=window.SalesOSHighlights.create(annotations,{
          documentId:'FINAL_PROJECT',blockIds:[finalBlock],quote:'Заметка итогового проекта',anchorQuote:'Заметка итогового проекта',
          contextBefore:'',contextAfter:'',textVersion:'87654321'
        },'Фрагмент итогового проекта',Date.now(),'44444444-4444-4444-8444-444444444444');
        await store.updateState(state=>({...state,personalTemplates:templates,annotations}));
      }''')

      # Export keeps the schema compact, but includes human-entered notes.
      page.evaluate('''()=>{
        URL.createObjectURL = blob => {window.__downloadedBackup=blob;return 'blob:fake-download';};
        HTMLAnchorElement.prototype.click=function(){window.__downloadName=this.download;};
      }''')
      page.locator('[data-export]').click()
      page.wait_for_timeout(200)
      saved_backup=page.evaluate('''async()=>JSON.parse(await window.__downloadedBackup.text())''')
      assert saved_backup['format']=='sales-os-v9'
      assert saved_backup['notes']['01-MODULE']=='Историческая заметка к модулю 01'
      assert saved_backup['lessonStatuses']['01-001']=='theory_completed'
      assert page.evaluate('window.__downloadName')=='sales-os-backup.json'
      assert saved_backup['version']==9
      saved_highlights=saved_backup['annotations']['items']
      assert len(saved_highlights)==2
      assert any(value['quote']=='Пример локальной цитаты' and value['comment']=='Сохранить только в браузере' for value in saved_highlights.values())
      assert any(value['documentId']=='FINAL_PROJECT' and value['comment']=='Фрагмент итогового проекта' for value in saved_highlights.values())
      saved_templates=saved_backup['personalTemplates']['items']
      assert len(saved_templates)==1
      saved_template=next(iter(saved_templates.values()))
      assert saved_template['title']=='Локальный шаблон'
      assert saved_template['versions'][0]['name']=='Базовая версия'
      print('PASS: v9 backup export preserves private templates, text annotations, notes and statuses')
      upload_json(page,saved_backup)
      restored=get_state(page)['personalTemplates']['items']
      assert len(restored)==1
      restored_template=next(iter(restored.values()))
      assert restored_template['title']=='Локальный шаблон'
      assert restored_template['versions'][0]['name']=='Базовая версия'
      restored_highlights=get_state(page)['annotations']['items']
      assert len(restored_highlights)==2
      assert any(value['documentId']=='FINAL_PROJECT' and value['comment']=='Фрагмент итогового проекта' for value in restored_highlights.values())
      assert page.evaluate("localStorage.getItem('sales-os-note-01-MODULE')")=='Историческая заметка к модулю 01'
      print('PASS: v9 backup round-trip restores personal template history, text annotations and notes')

      # Preserve clean state on broken JSON, bogus IDs and forbidden module bookmarks.
      for bad in [
        {'format':'sales-os-v2','version':2,'lessonStatuses':{'NOPE':'mastered'},'practiceStatuses':{},'bookmarks':[]},
        {'format':'sales-os-v2','version':2,'lessonStatuses':{},'practiceStatuses':{},'bookmarks':['01-MODULE']},
        {'format':'sales-os-v2','version':2,'lessonStatuses':{},'practiceStatuses':{},'bookmarks':[], 'notes':{'unknown':'secret'}}
      ]:
        before=get_state(page)
        upload_json(page,bad)
        assert get_state(page)==before
      print('PASS: invalid IDs, module bookmarks and unknown notes cannot overwrite backup state')

      persisted=page.evaluate('window.__testStorage')
      page.close();page=browser.new_page()
      load(page,'lesson/01-002',persisted,delayed_storage=True)
      page.locator('[data-note]').fill('Не перезаписывать: текст уже набран')
      page.wait_for_timeout(370)
      assert page.locator('[data-note]').input_value()=='Не перезаписывать: текст уже набран'
      print('PASS: delayed IndexedDB hydration never overwrites a note typed immediately after page load')
      browser.close()

if __name__=='__main__':main()
