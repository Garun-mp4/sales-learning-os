"""M5 shared shell, original rubric and source index; no personal content is built."""
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def project_data(entries):
    text=(ROOT/'sales-knowledge-base/FINAL_PROJECT.md').read_text(encoding='utf-8')
    rubric=[{'id':f'criterion-{i}','label':label,'description':description} for i,(label,description) in enumerate(re.findall(r'^\d+\. \*\*(.+?):\*\* (.+)$',text,re.M),1)]
    if len(rubric)!=10:raise ValueError('Expected ten project stages')
    return {'rubric':rubric,'practices':{k:{'id':k,'title':e['title'],'kind':e['kind']} for k,e in entries.items() if e['kind']=='practice'}}
def render_projects(entries,workspace=''):
    payload=json.dumps(project_data(entries),ensure_ascii=False).replace('<','\\u003c')
    return '<nav class="breadcrumb" aria-label="Хлебные крошки"><a href="/final-project/">Итоговая практика</a> › <span aria-current="page">Мои проекты</span></nav><header class="pagehead"><h1 class="h1">Мои проекты</h1><p class="intro">Соберите контекст, ответы по десяти этапам и проверенные вами материалы в рабочую тетрадь.</p></header><section data-projects-root data-pagefind-ignore><script type="application/json" data-projects-data>'+payload+'</script><p data-projects-notice role="status" aria-live="polite">Загрузка локальных проектов…</p><div class="project-create"><label>Название нового проекта<input data-project-name maxlength="120" placeholder="Например, сайт студии"/></label><button type="button" class="btn primary" data-project-create>Создать проект</button></div><div data-projects-list class="projects-list"></div><div data-projects-work></div><noscript>Для личной тетради включите JavaScript. <a href="/final-project/">Условия итоговой практики</a> доступны без него.</noscript></section>'+('<template data-project-template>'+workspace+'</template>' if workspace else '')
