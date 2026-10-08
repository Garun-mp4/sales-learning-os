#!/usr/bin/env python3
"""Regression checks for M5 topic-specific guidance and review-state integrity."""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTENT = ROOT / "sales-knowledge-base"
MANIFEST = json.loads((ROOT / "src/generated/content-manifest.json").read_text(encoding="utf-8"))
ISSUES: list[str] = []


def read_frontmatter(path: pathlib.Path):
    parts = path.read_text(encoding="utf-8").split("---", 2)
    if len(parts) != 3 or parts[0].strip():
        ISSUES.append(f"Invalid frontmatter: {path.relative_to(ROOT)}")
        return {}, ""
    return yaml.safe_load(parts[1]), parts[2]


lessons = sorted((CONTENT / "modules").rglob("theory/*.md"))
goals = set()
checks = set()
hints = set()
for path in lessons:
    metadata, body = read_frontmatter(path)
    goal = re.search(r"(?m)^\*\*Цель урока:\*\* (.+)$", body)
    check = re.search(r"(?m)^\*\*Проверь понимание:\*\* (.+)$", body)
    hint = re.search(r"(?m)^\*\*Подсказка:\*\* (.+)$", body)
    if not all((goal, check, hint)):
        ISSUES.append(f"Lesson lacks personalized goal/check/hint: {metadata.get('id', path.name)}")
        continue
    if metadata.get("title", "") not in hint.group(1) or "факт от гипотезы" not in hint.group(1):
        ISSUES.append(f"Lesson hint is not grounded in its self-practice prompt: {metadata.get('id')}")
    if metadata.get("status") != "editorial_draft":
        ISSUES.append(f"M5 must not auto-verify lesson {metadata.get('id')}")
    if goal.group(1) in goals:
        ISSUES.append(f"Lesson goal is duplicated: {metadata.get('id')}")
    goals.add(goal.group(1))
    checks.add(check.group(1))
    hints.add(hint.group(1))
    if "Эталонная логика проверки" in body or "Ориентир ответа" in body:
        ISSUES.append(f"Generic lesson rubric remains: {metadata.get('id')}")

practices = sorted((CONTENT / "modules").rglob("practice/*.md"))
rubrics = set()
for path in practices:
    metadata, body = read_frontmatter(path)
    section = re.search(r"(?ms)^## Рубрика проверки \(10 баллов\)\s*\n(.*?)(?=^##\s+|\Z)", body)
    if not section:
        ISSUES.append(f"Practice lacks task rubric: {metadata.get('id', path.name)}")
        continue
    rubric = section.group(1).strip()
    if rubric in rubrics:
        ISSUES.append(f"Practice rubric is duplicated: {metadata.get('id')}")
    rubrics.add(rubric)
    if "| Учебная цель |" not in rubric or "| Итоговый результат |" not in rubric or "| Применение к условию |" not in rubric:
        ISSUES.append(f"Practice rubric lacks task-derived criteria: {metadata.get('id')}")
    if "**Сильный ориентир (структура, не готовый ответ):**" not in rubric or "**Слабый пример:**" not in rubric:
        ISSUES.append(f"Practice lacks contrasting examples: {metadata.get('id')}")
    if "В собственном ответе отдели факты из условия от гипотез" not in rubric or "не подготовить артефакт" not in rubric:
        ISSUES.append(f"Practice examples do not model evidence and missing work: {metadata.get('id')}")
    if metadata.get("status") != "editorial_draft":
        ISSUES.append(f"M5 must not auto-verify practice {metadata.get('id')}")

entries = MANIFEST["entries"]
if len(lessons) != 336 or any(len(values) != 336 for values in (goals, checks, hints)):
    ISSUES.append(f"Expected 336 distinct topic-specific lesson goals/checks/hints; found {len(goals)}/{len(checks)}/{len(hints)}")
if len(practices) != 72 or len(rubrics) != 72:
    ISSUES.append(f"Expected 72 distinct task rubrics; found {len(rubrics)}")
if len(entries) != 430 or any(entry["status"] != "editorial_draft" for entry in entries.values()):
    ISSUES.append("Core editorial statuses changed without review evidence")

ledger = json.loads((CONTENT / "editorial-review-ledger.json").read_text(encoding="utf-8"))
if ledger["format"] != "sales-os-editorial-review-v1":
    ISSUES.append("Unsupported editorial review ledger format")
if MANIFEST.get("editorialReviews") != ledger["records"]:
    ISSUES.append("Generated manifest does not reflect the editorial review ledger")

library_meta = {}
for filename, expected_id in (("GLOSSARY.md", "glossary"), ("CASE_LIBRARY.md", "cases"), ("TEMPLATE_LIBRARY.md", "templates")):
    metadata, body = read_frontmatter(CONTENT / filename)
    library_meta[metadata.get("id")] = metadata
    if metadata.get("id") != expected_id or not body.strip():
        ISSUES.append(f"Library metadata/body is incomplete: {filename}")
if set(library_meta) != {"glossary", "cases", "templates"}:
    ISSUES.append("Exactly three library documents must be registered")

migration = subprocess.run(
    [sys.executable, str(ROOT / "scripts/enrich_course_materials_m5.py")],
    check=True,
    capture_output=True,
    text=True,
    encoding="utf-8",
)
if not migration.stdout.rstrip().endswith("DRY RUN: 0 learning documents"):
    ISSUES.append("M5 content migration is not idempotent")

if ISSUES:
    for issue in ISSUES[:40]:
        print("ERROR:", issue)
    raise SystemExit(f"FAIL: {len(ISSUES)} M5 content issues")

print(
    f"PASS: {len(lessons)} lessons have distinct goals/checks/hints; "
    f"{len(practices)} practices have distinct task rubrics and examples; "
    f"{len(entries)} core materials retain their editorial status"
)
