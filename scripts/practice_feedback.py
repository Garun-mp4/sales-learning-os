"""Shared, escaped M1 markup and rubric-bound content validation for both renderers."""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTENT = ROOT / 'sales-knowledge-base'
GUIDE_IDS = ['03-P01', '03-P03', '05-P03', '06-P01', '06-P02', '08-P02', '08-P03', '11-P01', '12-P03', '13-P02']


def rubric_rows(markdown):
    section = re.split(r'^##\s+Рубрика проверки[^\n]*\n', markdown, maxsplit=1, flags=re.M)
    if len(section) != 2:
        return []
    rows = []
    for line in re.split(r'^##\s', section[1], maxsplit=1, flags=re.M)[0].splitlines():
        if not line.startswith('|') or not line.endswith('|'):
            continue
        cells = [re.sub(r'\s+', ' ', re.sub(r'[*`]', '', c)).strip() for c in re.split(r'(?<!\\)\|', line[1:-1])]
        if len(cells) < 2 or cells[0].startswith('Критерий') or re.fullmatch(r'[:\-]+', cells[0]):
            continue
        rows.append({'id': f'criterion-{len(rows)+1}', 'label': cells[0], 'description': cells[1]})
    return rows


def load_guides(entries, source=None):
    if source is None:
        source = json.loads((CONTENT / 'practice-guides.json').read_text(encoding='utf-8'))
    if source['schemaVersion'] != 1 or sorted(source['guides']) != sorted(GUIDE_IDS):
        raise ValueError('M1 requires the ten declared guide IDs and schema 1')
    for id, guide in source['guides'].items():
        entry = entries[id]
        rubric = rubric_rows((CONTENT / entry['path']).read_text(encoding='utf-8'))
        if entry['kind'] != 'practice' or guide['rubric'] != rubric:
            raise ValueError(f'{id}: rubric changed; review guide explanations before publishing')
        if guide['version'] < 1 or guide['status'] not in ('editorial_draft', 'verified'):
            raise ValueError(f'{id}: invalid version/status')
        review = guide['review']
        if not review['scope'] or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', review['checkedOn']):
            raise ValueError(f'{id}: review scope/date required')
        if guide['status'] == 'verified' and (not review.get('humanReviewer') or not review.get('role')):
            raise ValueError(f'{id}: verified requires a named human reviewer and role')
        for key in ('context', 'alternative'):
            if not isinstance(guide[key], str) or not guide[key].strip():
                raise ValueError(f'{id}: missing {key}')
        for key, count in (('hints', 3), ('mistakes', 3), ('examples', 3)):
            if len(guide[key]) != count:
                raise ValueError(f'{id}: expected {count} {key}')
        for value in guide['hints'] + guide['mistakes']:
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f'{id}: empty hint/mistake')
        for index, example in enumerate(guide['examples']):
            if example['level'] != ('weak', 'acceptable', 'strong')[index] or not example['answer'].strip():
                raise ValueError(f'{id}: incomplete examples')
            if set(example['explanations']) != {row['id'] for row in rubric} or not all(example['explanations'].values()):
                raise ValueError(f'{id}: every example must explain every criterion')
    return source['guides']


def render_feedback(id, guides):
    h = html.escape
    guide = guides.get(id)
    output = [f'<section class="practice-feedback" data-pagefind-body aria-labelledby="feedback-{h(id)}"><h3 class="h2" id="feedback-{h(id)}">Подсказки и разбор ответа</h3>']
    if guide:
        review_label = 'Редакционный черновик · независимая рецензия не пройдена' if guide['status'] == 'editorial_draft' else 'Проверено редактором'
        output.append(f'<p class="small muted" data-guide-status>{review_label} · версия {guide["version"]} · {h(guide["review"]["checkedOn"])}</p><p>Сначала попробуйте ответить самостоятельно. Подсказки и примеры можно открыть в любой момент; это не меняет ваш прогресс и самооценку.</p><p class="small muted">{h(guide["context"])}</p>')
        output.append('<div class="feedback-hints" data-guide-hints>')
        for i, hint in enumerate(guide['hints'], 1):
            output.append(f'<details class="feedback-disclosure"><summary>Подсказка {i}</summary><p>{h(hint)}</p></details>')
        output.append('</div><details class="feedback-disclosure" data-guide-examples><summary>Открыть разобранные примеры</summary><div class="feedback-body"><p class="small muted">Учебные ситуации вымышлены. Это варианты рассуждения, а не готовые ответы для отправки клиенту. Оценка ниже относится к примеру, а не к вашему ответу.</p>')
        for label, example in zip(('Слабый ответ', 'Приемлемый ответ', 'Сильный ответ'), guide['examples']):
            output.append(f'<details class="feedback-example" data-guide-example="{example["level"]}"><summary>{label}</summary><div class="feedback-body"><p class="feedback-answer">{h(example["answer"])}</p><h4>Разбор по критериям</h4><dl class="feedback-rubric">')
            for row in guide['rubric']:
                output.append(f'<dt>{h(row["label"])}</dt><dd>{h(example["explanations"][row["id"]])}</dd>')
            output.append('</dl></div></details>')
        output.append('<h4>Типичные ошибки и как исправить</h4><ul>'+''.join(f'<li>{h(m)}</li>' for m in guide['mistakes'])+'</ul><h4>Другой допустимый подход</h4><p>'+h(guide['alternative'])+'</p></div></details>')
    elif id == 'FINAL_PROJECT':
        output.append('<p class="muted">Отдельный разбор проекта пока не подготовлен. Используйте критерии этапов и сравнение собственных итераций ниже.</p>')
    else:
        output.append('<p class="muted" data-guide-unavailable>Разбор этого задания пока не подготовлен. Редактор, самопроверка и сравнение итераций доступны полностью.</p>')
    output.append(f'</section><section class="practice-comparison" data-practice-comparison="{h(id)}" aria-labelledby="comparison-{h(id)}"><h3 class="h2" id="comparison-{h(id)}">Сравнение итераций</h3><p class="muted">Сопоставьте ответы и самооценку по критериям. Изменение текста само по себе не означает улучшение качества.</p><p data-comparison-status role="status" aria-live="polite">Загрузка истории…</p><div data-comparison-controls hidden class="comparison-controls"><label>Первая итерация<select data-comparison-left></select></label><label>Вторая итерация<select data-comparison-right></select></label></div><div data-comparison-result></div><noscript><p>Для сравнения сохранённых на устройстве ответов включите JavaScript.</p></noscript></section>')
    return ''.join(output)
