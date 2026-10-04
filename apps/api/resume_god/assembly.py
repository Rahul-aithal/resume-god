"""Relevance-ordered resume assembly with a deterministic page budget."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


DEFAULT_PAGE_BUDGET_CHARS = 3200


def build_assembly(
    plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    page_budget_chars: int = DEFAULT_PAGE_BUDGET_CHARS,
    summary: str | None = None,
) -> dict[str, Any]:
    """Order selected evidence by score and trim from the weakest evidence."""
    if page_budget_chars < 400:
        raise ValueError("page_budget_chars must be at least 400")
    if not all(plan.get("audit", {}).values()):
        raise ValueError("Cannot assemble a plan with failed audit checks")

    achievements = {
        item["id"]: item for item in profile["achievements"]
    }
    ranking = list(plan.get("ranking", []))
    if not ranking:
        raise ValueError("Cannot assemble a plan with no ranked achievements")

    summary_text = summary if summary is not None else ""
    retained = list(ranking)
    trimmed: list[dict[str, Any]] = []
    while len(retained) > 1:
        text_size = (
            len(summary_text)
            + sum(
                len(achievements[row["achievement_id"]]["text"])
                for row in retained
            )
        )
        if text_size <= page_budget_chars:
            break
        removed = retained.pop()
        trimmed.append(removed)

    retained_ids = [row["achievement_id"] for row in retained]
    retained_set = set(retained_ids)
    rank_position = {item: index for index, item in enumerate(retained_ids)}

    parent_kind = {
        reference["id"]: reference["kind"]
        for reference in plan["selected_parents"]
    }
    parent_rows: list[dict[str, Any]] = []
    for row in retained:
        achievement = achievements[row["achievement_id"]]
        parent_id = achievement["part_of"]
        if parent_id not in parent_kind:
            raise ValueError(f"Ranked achievement has unknown parent: {parent_id}")
        existing = next(
            (item for item in parent_rows if item["id"] == parent_id), None
        )
        if existing is None:
            parent_rows.append(
                {
                    "kind": parent_kind[parent_id],
                    "id": parent_id,
                    "achievement_ids": [achievement["id"]],
                    "best_rank": rank_position[achievement["id"]],
                }
            )
        else:
            existing["achievement_ids"].append(achievement["id"])

    parent_rows.sort(key=lambda item: item["best_rank"])
    for item in parent_rows:
        item["achievement_ids"].sort(key=lambda aid: rank_position[aid])
        item.pop("best_rank")

    assembly = {
        "version": 1,
        "page_budget_chars": page_budget_chars,
        "section_order": list(dict.fromkeys(item["kind"] for item in parent_rows)),
        "retained_achievement_ids": retained_ids,
        "trimmed_achievement_ids": [row["achievement_id"] for row in trimmed],
        "selected_parents": parent_rows,
    }
    return assembly


def apply_assembly(
    plan: dict[str, Any],
    profile: dict[str, Any],
    assembly: dict[str, Any],
) -> dict[str, Any]:
    """Return a plan copy containing only the assembled, ordered evidence."""
    achievements = {
        item["id"]: item for item in profile["achievements"]
    }
    retained = set(assembly["retained_achievement_ids"])
    assembled = deepcopy(plan)
    assembled["selected_achievements"] = [
        achievements[item]
        for item in assembly["retained_achievement_ids"]
    ]
    assembled["selected_parents"] = deepcopy(assembly["selected_parents"])
    assembled["ranking"] = [
        row for row in plan.get("ranking", []) if row["achievement_id"] in retained
    ]
    assembled["assembly"] = deepcopy(assembly)
    return assembled
