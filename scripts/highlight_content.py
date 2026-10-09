"""Shared static markup for the local highlight UI in both renderers."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT / "src" / "templates" / "highlight-workspace.html"


def render_highlight_workspace() -> str:
    return WORKSPACE.read_text(encoding="utf-8")
