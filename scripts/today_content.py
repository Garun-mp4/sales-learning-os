"""Shared M3 markup, estimates are task ranges, not reading-speed claims."""
import json
def render_today(entries):
    payload = json.dumps({"entries": {key: value for key, value in entries.items() if value["kind"] in ("theory", "practice")}}, ensure_ascii=False).replace("<", "\\u003c")
    return '<header class="pagehead"><h1 class="h1">Занятие на сегодня</h1><p class="intro">Выберите посильный шаг: повторите знакомое, разберите новое и попробуйте на практике.</p></header><section data-today-root data-pagefind-ignore><script type="application/json" data-today-data>'+payload+'</script><p data-today-notice role="status" aria-live="polite">Загрузка сохранённого занятия…</p><div data-today-workspace></div><noscript>Для сохранения и составления занятия включите JavaScript. <a href="/roadmap/">Программа курса</a> доступна без него.</noscript></section>'
