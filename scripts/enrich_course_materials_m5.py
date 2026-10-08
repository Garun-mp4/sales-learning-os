#!/usr/bin/env python3
"""One-time, source-preserving M5 migration for duplicated learning guidance."""
from __future__ import annotations

import argparse
import os
import pathlib
import re

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTENT = ROOT / "sales-knowledge-base/modules"


def section(body: str, title: str, numbered: bool) -> str:
    heading = (
        rf"^##\s+\d+\.\s+{re.escape(title)}\s*$"
        if numbered
        else rf"^##\s+{re.escape(title)}\s*$"
    )
    match = re.search(rf"(?ms){heading}\s*\n(.*?)(?=^##\s+|\Z)", body)
    if not match:
        raise ValueError(f"Missing section: {title}")
    return match.group(1).strip()


def first_paragraph(value: str) -> str:
    return next((part.strip() for part in re.split(r"\n\s*\n", value) if part.strip()), "")


def clean_markdown(value: str) -> str:
    return re.sub(r"[*`]+", "", re.sub(r"\s+", " ", value)).strip()


def trim_terminal(value: str) -> str:
    return re.sub(r"[.!?…]+$", "", value).strip()


def lesson_replacements(body: str, title: str) -> str:
    outcomes = section(body, "Критерии освоения", numbered=True)
    questions = section(body, "Вопросы для самопроверки", numbered=True)
    checklist = [
        line.strip()[len("- [ ] ") :]
        for line in outcomes.splitlines()
        if line.strip().startswith("- [ ] ")
    ]
    prompts = [
        re.sub(r"^\d+\.\s*", "", line.strip())
        for line in questions.splitlines()
        if re.match(r"^\s*\d+\.\s+", line)
    ]
    exercise = section(body, "Самостоятельная отработка", numbered=True)
    if len(checklist) < 2 or not prompts:
        raise ValueError("Lesson needs two mastery checks and one review question")
    goal = clean_markdown(checklist[0])
    exercise_prompt = clean_markdown(first_paragraph(exercise))
    if not exercise_prompt:
        raise ValueError("Lesson needs a concrete self-practice prompt")
    hint_text = (
        "При выполнении задания проверь именно «"
        + title
        + "»: свяжи понятие с условием, отдели факт от гипотезы и назови сведения, которых не хватает для решения."
    )
    question = clean_markdown(prompts[0])
    if "**Эталонная логика проверки:**" not in body or "**Ориентир ответа:**" not in body:
        if "**Цель урока:**" in body and "**Проверь понимание:**" in body:
            if "**Подсказка:** " + hint_text in body:
                return body
            body, hint_count = re.subn(
                r"(?m)^\*\*Подсказка:\*\*.*$",
                "**Подсказка:** " + hint_text,
                body,
            )
            if hint_count != 1:
                raise ValueError(f"Expected one lesson hint, got {hint_count}")
            return body
        raise ValueError("The original shared lesson prompts were not found")
    body, goal_count = re.subn(
        r"(?m)^\*\*Эталонная логика проверки:\*\*.*$",
        "**Цель урока:** " + goal,
        body,
    )
    body, check_count = re.subn(
        r"(?m)^\*\*Ориентир ответа:\*\*.*$",
        "**Проверь понимание:** "
        + question
        + " Обоснуй ответ на примере из самостоятельной отработки.\n\n"
        + "**Подсказка:** "
        + hint_text,
        body,
    )
    if goal_count != 1 or check_count != 1:
        raise ValueError(f"Expected one shared prompt pair, got {goal_count}/{check_count}")
    if not exercise:
        raise ValueError("Lesson has no self-practice prompt")
    return body


def practice_replacements(body: str, title: str) -> str:
    goal = clean_markdown(first_paragraph(section(body, "Цель", numbered=False)))
    artifact_section = section(body, "Итоговый артефакт", numbered=False)
    artifact_match = re.search(r"\*\*Артефакт:\s*(.*?)\*\*", artifact_section, re.S)
    if not artifact_match:
        raise ValueError(f"{title}: expected a specific artifact description")
    artifact = clean_markdown(artifact_match.group(1)).rstrip(" .")
    situation = clean_markdown(first_paragraph(section(body, "Исходная ситуация", numbered=False)))
    direction = clean_markdown(first_paragraph(section(body, "Пример направления решения", numbered=False)))
    if not all((goal, artifact, situation, direction)):
        raise ValueError(f"{title}: goal, artifact, case, and direction are required")
    situation = trim_terminal(situation)
    goal = trim_terminal(goal)
    direction = trim_terminal(direction)
    strong_example = (
        "**Сильный ориентир (структура, не готовый ответ):** разбери сценарий задания, подготовь артефакт — "
        + artifact
        + " — и свяжи его с целью: "
        + goal
        + ". Как направление решения используй: "
        + direction
        + ". В собственном ответе отдели факты из условия от гипотез, назови недостающие данные и следующий способ проверки. Не добавляй неподтверждённые факты."
    )
    weak_example = (
        "**Слабый пример:** ограничиться общей фразой «нужно улучшить продажи» и не подготовить артефакт — "
        + artifact
        + ". Тогда работа не показывает, как выполнена цель «"
        + goal
        + "»; основания, неизвестные данные и способ проверить результат не указаны."
    )
    rubric = (
        "## Рубрика проверки (10 баллов)\n\n"
        "Оцени каждый критерий: **0** — отсутствует или противоречит условию; "
        "**1** — выполнен частично; **2** — выполнен полностью, понятно и проверяемо.\n\n"
        "| Критерий для этого задания | Что проверить |\n"
        "|---|---|\n"
        f"| Учебная цель | {goal} |\n"
        f"| Итоговый результат | Подготовлен артефакт: {artifact}. |\n"
        f"| Применение к условию | Решение учитывает учебную ситуацию: {situation}. |\n"
        "| Основания и неопределённость | Проверяемые сведения отделены от гипотез; для внешних фактов указаны источник, дата и область применимости либо прямо указано, что их ещё нужно проверить. |\n"
        "| Ограничения и следующая итерация | Учтены требования задания, допустимость действий и данные клиента; описан наблюдаемый способ проверить результат или остановиться. |\n\n"
        + strong_example
        + "\n\n"
        + weak_example
        + "\n\n"
        "**Ориентир самостоятельной проверки:** не менее 8/10. Если обнаружилось нарушение закона, конфиденциальности или правил канала, останови реальное применение и запроси профильную проверку. Баллы не являются аттестацией."
    )
    if "**Сильный ориентир (структура, не готовый ответ):** разбери сценарий задания," in body:
        return body
    pattern = r"(?ms)^## Рубрика проверки \(10 баллов\)\s*\n.*?(?=^##\s+|\Z)"
    body, count = re.subn(pattern, rubric + "\n\n", body)
    if count == 0:
        if "**Сильный пример (учебная структура, без придуманных данных):**" in body:
            return body
        if "**Сильный пример (учебный ориентир, не готовый ответ):**" in body:
            body, strong_count = re.subn(r"(?m)^\*\*Сильный пример \(учебный ориентир, не готовый ответ\):\*\*.*$", strong_example, body)
            body, weak_count = re.subn(r"(?m)^\*\*Слабый пример:\*\*.*$", weak_example, body)
            if strong_count == 1 and weak_count == 1:
                return body
    if count != 1:
        raise ValueError(f"{title}: expected one generic rubric section, got {count}")
    return body


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write the transformed Markdown files")
    args = parser.parse_args()
    changed = 0
    for path in sorted(CONTENT.rglob("*.md")):
        raw = path.read_text(encoding="utf-8")
        parts = raw.split("---", 2)
        if len(parts) != 3 or parts[0].strip():
            continue
        metadata = yaml.safe_load(parts[1])
        body = parts[2]
        if metadata.get("kind") == "theory":
            updated = lesson_replacements(body, metadata["title"])
        elif metadata.get("kind") == "practice":
            updated = practice_replacements(body, metadata["title"])
        else:
            continue
        if updated == body:
            continue
        changed += 1
        if args.apply:
            encoded = (parts[0] + "---" + parts[1] + "---" + updated).encode("utf-8")
            temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
            try:
                temporary.write_bytes(encoded)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
    print(f"{'APPLIED' if args.apply else 'DRY RUN'}: {changed} learning documents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
