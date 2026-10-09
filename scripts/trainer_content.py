"""Public M2 scenario validation and shared markup for both static renderers."""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
IDS = {'price-context', 'too-expensive', 'proposal-silence', 'competitor', 'unclear-need', 'extra-work'}


def load_scenarios(entries, source=None):
    data = source if source is not None else json.loads((ROOT / 'sales-knowledge-base/trainer-scenarios.json').read_text(encoding='utf-8'))
    if data['schemaVersion'] != 1 or len(data['scenarios']) != 6 or {s['id'] for s in data['scenarios']} != IDS:
        raise ValueError('M2 requires six declared scenarios, schema 1')
    for s in data['scenarios']:
        if not isinstance(s['version'], int) or s['version'] < 1 or s['status'] not in ('editorial_draft', 'verified'):
            raise ValueError('Invalid scenario version/status')
        if s['status'] == 'verified' and (not s['review'].get('reviewer') or not s['review'].get('role')):
            raise ValueError('Verified requires a human reviewer and role')
        if not s['review']['scope'] or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', s['review']['checkedOn']):
            raise ValueError('Review scope/date required')
        for key in ('title', 'context', 'goal', 'constraints'):
            if not isinstance(s[key], str) or not s[key].strip():
                raise ValueError('Missing scenario context')
        if not s['related'] or any(id not in entries for id in s['related']):
            raise ValueError('Unknown course reference')
        seen, active, decisions, ends = set(), set(), set(), set()

        def visit(id):
            if id in active:
                raise ValueError('Scenario cycle')
            if id in seen:
                return
            if id not in s['nodes'] or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', id):
                raise ValueError('Missing node')
            seen.add(id)
            active.add(id)
            n = s['nodes'][id]
            if not n['message'].strip():
                raise ValueError('Empty message')
            if n['kind'] == 'end':
                if not n['outcome'].strip():
                    raise ValueError('Missing outcome')
                ends.add(id)
            elif n['kind'] == 'decision':
                decisions.add(id)
                choices = n['choices']
                if not 2 <= len(choices) <= 6 or len({c['id'] for c in choices}) != len(choices):
                    raise ValueError('Invalid choices')
                for c in choices:
                    if not c['label'].strip() or not c['feedback'].strip() or not all(isinstance(c[k], str) for k in ('strength', 'omission')):
                        raise ValueError('Missing choice explanation')
                    visit(c['next'])
            else:
                raise ValueError('Invalid node kind')
            active.remove(id)

        visit(s['start'])
        if seen != set(s['nodes']) or len(decisions) < 3 or len(ends) < 2:
            raise ValueError('Unreachable nodes or incomplete scenario')
    return data['scenarios']


def render_trainer(scenarios, id=None):
    h = html.escape
    selected = next((s for s in scenarios if s['id'] == id), None)
    title = selected['title'] if selected else 'Тренажёр переписки'
    output = [f'<nav class="breadcrumb" aria-label="Хлебные крошки"><a href="/practice/">Практика</a> › '+
              (f'<a href="/trainer/">Тренажёр</a> › <span aria-current="page">{h(title)}</span>' if selected else '<span aria-current="page">Тренажёр</span>')+'</nav>',
              f'<header class="pagehead"><h1 class="h1">{h(title)}</h1><p class="intro">Отработайте решения в учебной переписке. Ваши ответы остаются на этом устройстве.</p></header>',
              '<p class="notice">Это вымышленные сценарии, а не чат с человеком или AI. Ветку определяет выбранное действие. Собственный текст сохраняется для саморазбора и не оценивается автоматически.</p>']
    if selected:
        output.append(f'<section class="trainer-context" aria-labelledby="trainer-context"><h2 class="h2" id="trainer-context">Задача</h2><p>{h(selected["context"])}</p><dl><dt>Цель</dt><dd>{h(selected["goal"])}</dd><dt>Ограничения</dt><dd>{h(selected["constraints"])}</dd></dl><p class="small muted">Редакционный черновик · независимая рецензия не пройдена · версия {selected["version"]}</p></section>')
    else:
        output.append('<section aria-labelledby="trainer-scenarios"><h2 class="h2" id="trainer-scenarios">Выберите ситуацию</h2><div class="trainer-catalog">')
        for s in scenarios:
            output.append(f'<article><h3><a href="/trainer/{h(s["id"])}/">{h(s["title"])}</a></h3><p>{h(s["goal"])}</p><span class="small muted">Учебный сценарий · редакционный черновик</span></article>')
        output.append('</div></section>')
    payload = json.dumps(scenarios if selected is None else [selected], ensure_ascii=False).replace('<', '\\u003c')
    output.append(f'<section data-trainer-root data-scenario-id="{h(id or "")}" data-pagefind-ignore><script type="application/json" data-trainer-data>{payload}</script><p data-trainer-notice role="status" aria-live="polite">Загрузка локальной истории…</p><div data-trainer-workspace></div><section class="trainer-history" aria-labelledby="trainer-history"><h2 class="h2" id="trainer-history">Мои попытки</h2><div data-trainer-history></div></section><section class="trainer-compare" aria-labelledby="trainer-compare"><h2 class="h2" id="trainer-compare">Сравнить завершённые попытки</h2><p>Сопоставьте решения и объяснения. Изменение действия не является автоматической оценкой качества.</p><div data-trainer-comparison></div></section><noscript><p>Для локального тренажёра включите JavaScript. Описания сценариев доступны выше.</p></noscript></section>')
    return ''.join(output)
