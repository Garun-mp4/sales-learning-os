import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def load_questions(entries):
    bank = json.loads((ROOT / 'sales-knowledge-base/review-questions.json').read_text(encoding='utf-8-sig'))
    questions = bank['questions']
    assert bank['schemaVersion'] == 1 and len(questions) >= 30
    assert len({q['id'] for q in questions}) == len(questions)
    assert {q['module'] for q in questions} == {'01','02','08'}
    for q in questions:
        assert entries[q['entryId']]['kind'] == 'theory' and entries[q['entryId']]['module'] == q['module']
        assert q['version'] >= 1 and q['skill'].strip() and q['prompt'].strip() and q['explanation'].strip()
        assert q['review']['method'] == 'author_self_review' and q['review']['scope'].strip()
        if q['type'] == 'choice':
            assert len(q['options']) >= 3 and q['answerId'] in {o['id'] for o in q['options']} and not q['rubric']
        else:
            assert q['type'] == 'open' and len(q['rubric']) >= 3 and not q['options'] and not q['answerId']
    return questions

def render_knowledge(questions):
    payload = json.dumps(questions, ensure_ascii=False).replace('<', '\\u003c')
    return '<nav class="breadcrumb" aria-label="Хлебные крошки"><a href="/review/">Очередь повтора</a> › <span aria-current="page">Проверка понимания</span></nav><header class="pagehead"><h1 class="h1">Проверка понимания</h1><p class="intro">Сначала вспомните и ответьте своими словами. Затем сверьтесь с разбором и вернитесь к теме.</p></header><section data-knowledge-root data-pagefind-ignore><script type="application/json" data-knowledge-data>'+payload+'</script><p class="notice">30 вопросов по модулям 01, 02 и 08: ключ для выбора ответа, рубрика для открытого кейса. Свободный текст оцениваете вы по критериям; статус урока от этого не меняется.</p><p data-knowledge-notice role="status" aria-live="polite">Загрузка локальных ответов…</p><div data-knowledge-stats class="knowledge-stats"></div><section data-knowledge-work class="knowledge-work" aria-label="Задание"></section><div data-knowledge-catalog class="knowledge-catalog"></div><section data-knowledge-history class="knowledge-history"></section><noscript>Для ответа и локального сохранения включите JavaScript. <a href="/roadmap/">Программа курса</a> доступна без него.</noscript></section>'
