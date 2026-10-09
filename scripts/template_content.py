"""Validate the reviewed, local-first personal-template starter catalog."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
STARTERS_PATH = ROOT / "sales-knowledge-base" / "personal-template-starters.json"
MANAGER_PATH = ROOT / "src" / "templates" / "personal-template-manager.html"
CATEGORIES = {"first_message", "discovery", "proposal", "objection", "follow_up"}
VARIABLES = {"service", "client", "context", "next_step"}


def load_starters() -> list[dict]:
    try:
        starters = json.loads(STARTERS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Cannot read personal-template starters: {error}") from error
    if not isinstance(starters, list) or len(starters) != len(CATEGORIES):
        raise ValueError("Personal-template starter catalog must contain exactly five records")
    ids: set[str] = set()
    categories: set[str] = set()
    for item in starters:
        if not isinstance(item, dict):
            raise ValueError("Personal-template starter must be an object")
        identifier = item.get("id")
        category = item.get("category")
        if not isinstance(identifier, str) or not re.fullmatch(r"starter:[a-z][a-z-]{1,30}", identifier) or identifier in ids:
            raise ValueError("Personal-template starter IDs must be unique and stable")
        if category not in CATEGORIES or category in categories:
            raise ValueError("Personal-template starters must cover each required category once")
        ids.add(identifier)
        categories.add(category)
        for field, limit in (("version", 40), ("title", 120), ("whenToUse", 1200), ("body", 50000)):
            value = item.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > limit:
                raise ValueError(f"Invalid {field} in starter {identifier}")
        tags = item.get("tags")
        if not isinstance(tags, list) or not tags or len(tags) > 20 or any(not isinstance(tag, str) or not tag.strip() or len(tag) > 40 for tag in tags):
            raise ValueError(f"Invalid tags in starter {identifier}")
        variables = set(re.findall(r"\{\{([^{}]*)\}\}", item["body"]))
        malformed = "{{" in re.sub(r"\{\{[^{}]*\}\}", "", item["body"]) or "}}" in re.sub(r"\{\{[^{}]*\}\}", "", item["body"])
        if variables - VARIABLES or malformed or not variables:
            raise ValueError(f"Invalid variable syntax in starter {identifier}")
        if re.search(r"</?[a-z][^>]*>", item["body"], flags=re.I):
            raise ValueError(f"Starter content must remain plain text: {identifier}")
    if categories != CATEGORIES:
        raise ValueError("Personal-template starter categories are incomplete")
    return starters


def render_manager(starters: list[dict]) -> str:
    template = MANAGER_PATH.read_text(encoding="utf-8")
    marker = "__TEMPLATE_STARTERS_JSON__"
    if template.count(marker) != 1:
        raise ValueError("Personal-template manager must have one starter-data slot")
    payload = json.dumps(starters, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("<", "\\u003c")
    return template.replace(marker, payload)
