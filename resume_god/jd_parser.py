"""Structured job-description parsing and profile-alias normalization."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterable, Protocol

from .tailor import load_profile

JD_PARSE_VERSION = 1
_CANDIDATE_HEADING = re.compile(
    r"^(?:key\s+)?(?:responsibilities|requirements|qualifications|skills|"
    r"required\s+skills(?:\s+and\s+qualifications)?|desired\s+skills|nice[- ]to[- ]have|"
    r"preferred qualifications|what you'?ll do|what you'?ll work on)[A-Za-z &/-]*$",
    re.IGNORECASE,
)
_NICE_HEADING = re.compile(
    r"^(?:desired\s+skills|nice[- ]to[- ]have|preferred qualifications|bonus|plus)\b",
    re.IGNORECASE,
)
_ROLE_LABEL = re.compile(r"^(?:job\s+(?:role|title)|role|position)\s*:\s*(.+)$", re.IGNORECASE)
_TECH_TERM = re.compile(
    r"(?<![\w])(?:\.NET|C\+\+|C#|Node\.js|React(?:\.js)?|Next\.js|Express(?:\.js)?|"
    r"TypeScript|JavaScript|Python|Java|Go|Golang|PostgreSQL|MySQL|MongoDB|SQL|"
    r"NoSQL|REST(?:ful)?\s+APIs?|GitHub(?:\s+Actions)?|Git|Docker|Kubernetes|"
    r"Azure|AWS|GCP|RAG|LLM|MCP|Flask|FastAPI|Angular|Vue(?:\.js)?|Svelte|"
    r"Tailwind(?:\s+CSS)?|GraphQL|Kafka|RabbitMQ|Redis|Jest|Vitest)(?![\w])",
    re.IGNORECASE,
)
_EXTRA_UNKNOWN = (
    ".NET", "C#", "Java", "MySQL", "Angular", "Vue.js", "Svelte", "Azure",
    "Kubernetes", "RAG", "Flask", "AWS", "GCP", "GraphQL", "Kafka",
    "Spring Boot", "Django", "LangChain", "OpenAI", "Terraform", "Jenkins",
)
_SENIORITIES = (
    (r"\bprincipal\b", "principal"),
    (r"\bstaff\b", "staff"),
    (r"\bsenior\b", "senior"),
    (r"\bjunior\b", "junior"),
    (r"\bentry.level\b", "entry-level"),
    (r"\bearly.career\b", "early-career"),
    (r"\bsde[ -]?1\b", "SDE1 / junior"),
    (r"\bsoftware engineer i\b", "junior"),
    (r"\blead(?:er|ership)?\b", "lead"),
)


class JDProvider(Protocol):
    def complete_json(self, prompt: str) -> dict[str, Any]:
        ...


def _skill_terms(profile: dict[str, Any]) -> dict[str, tuple[str, dict[str, Any]]]:
    terms: dict[str, tuple[str, dict[str, Any]]] = {}
    for skill in profile["skills"]:
        for term in (skill["name"], *skill.get("aliases", [])):
            terms[term.casefold()] = (skill["id"], skill)
    return terms


def _skill_rows(
    names: Iterable[str], terms: dict[str, tuple[str, dict[str, Any]]]
) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    unknown: list[str] = []
    seen: set[str] = set()
    for raw in names:
        name = str(raw).strip()
        if not name:
            continue
        match = terms.get(name.casefold())
        if match is None:
            match = next(
                (
                    (terms[key][0], terms[key][1])
                    for key in terms
                    if key.casefold() == name.casefold()
                ),
                None,
            )
        if match is None:
            if name not in unknown:
                unknown.append(name)
        elif match[0] not in seen:
            seen.add(match[0])
            skill = match[1]
            rows.append(
                {
                    "id": skill["id"],
                    "name": skill["name"],
                    "matched_term": name,
                }
            )
    return rows, unknown


def _known_matches(
    profile: dict[str, Any], job_description: str
) -> tuple[dict[str, list[dict]], set[str]]:
    terms = _skill_terms(profile)
    text = job_description
    matches: dict[str, list[dict[str, Any]]] = {"must": [], "nice": []}
    seen: set[str] = set()
    nice = False
    for line in text.splitlines():
        stripped = line.strip()
        if _CANDIDATE_HEADING.fullmatch(stripped):
            nice = bool(_NICE_HEADING.search(stripped))
            continue
        if not stripped:
            continue
        for term, (skill_id, skill) in terms.items():
            pattern = re.compile(
                rf"(?<!\w){re.escape(term)}(?!\w)", re.IGNORECASE
            )
            if pattern.search(stripped) and skill_id not in seen:
                seen.add(skill_id)
                bucket = "nice" if nice else "must"
                matches[bucket].append(
                    {
                        "id": skill["id"],
                        "name": skill["name"],
                        "matched_term": term,
                    }
                )
    return matches, seen


def _role_title(job_description: str, target_title: str | None) -> str:
    if target_title and target_title.strip():
        return target_title.strip()
    for line in job_description.splitlines():
        stripped = line.strip()
        match = _ROLE_LABEL.match(stripped)
        if match:
            return match.group(1).strip()
    explicit = re.search(
        r"(?m)^as\s+(?:an?\s+)?([A-Za-z][A-Za-z /.-]{2,60}?)(?:\s+at\b|,|\.|\()",
        job_description,
        re.IGNORECASE,
    )
    if explicit:
        return explicit.group(1).strip()
    looking_for = re.search(
        r"looking for\s+(?:talented\s+)?([A-Za-z][A-Za-z /.-]{2,60}?Developers)\b",
        job_description,
        re.IGNORECASE,
    )
    if looking_for:
        return looking_for.group(1).strip()
    for line in job_description.splitlines():
        stripped = line.strip()
        if (
            stripped
            and len(stripped) <= 80
            and not re.search(r"[:.]|^(?:company|about|location|experience)\b", stripped, re.I)
            and re.search(r"engineer|developer|manager|analyst|designer|architect", stripped, re.I)
        ):
            return stripped
    raise ValueError("Could not determine role title; pass --target-title")


def _seniority(job_description: str, role_title: str) -> str:
    def detect(value: str) -> str | None:
        for pattern, label in _SENIORITIES:
            if re.search(pattern, value.casefold()):
                return label
        return None

    explicit = detect(role_title)
    if explicit:
        return explicit

    found: list[str] = []
    for pattern, label in _SENIORITIES:
        if re.search(pattern, job_description.casefold()) and label not in found:
            found.append(label)
    if not found:
        return "not specified"
    if "junior" in found and "senior" in found:
        return "junior to senior"
    if "entry-level" in found and "senior" in found:
        return "entry-level to senior"
    return " / ".join(found)


def _responsibilities(job_description: str) -> list[str]:
    rows: list[str] = []
    active = False
    for raw in job_description.splitlines():
        stripped = raw.strip().lstrip("-•* ").strip()
        heading = bool(_CANDIDATE_HEADING.fullmatch(stripped))
        if heading:
            active = bool(re.search(r"responsib|what you'?ll(?: do| work on)", stripped, re.I))
            continue
        if not stripped:
            continue
        if active and len(stripped) > 15 and stripped not in rows:
            rows.append(stripped)
        elif active and re.match(r"^[A-Z][A-Za-z /,&+-]{3,60}$", stripped):
            continue
        elif active:
            active = False
    return rows[:12]


def _unknown_skills(
    job_description: str,
    known_ids: set[str],
    profile: dict[str, Any],
    terms: dict[str, tuple[str, dict[str, Any]]],
) -> list[dict[str, str]]:
    known_names = {
        skill["name"].casefold()
        for skill in profile["skills"]
        if skill["id"] in known_ids
    }
    aliases = {
        key.casefold() for key in terms if terms[key][0] in known_ids
    }
    values: list[str] = []
    for match in _TECH_TERM.finditer(job_description):
        value = match.group(0)
        if value.casefold() not in known_names and value.casefold() not in aliases:
            if value not in values:
                values.append(value)
    for value in _EXTRA_UNKNOWN:
        if (
            re.search(rf"(?<!\w){re.escape(value)}(?!\w)", job_description, re.IGNORECASE)
            and value not in values
        ):
            values.append(value)
    if "RESTful APIs" in values and "RESTful API" in values:
        values.remove("RESTful API")
    return [{"name": value, "status": "unknown"} for value in values]


def parse_job_description(
    profile: dict[str, Any],
    job_description: str,
    *,
    provider: JDProvider | None = None,
    target_title: str | None = None,
) -> dict[str, Any]:
    terms = _skill_terms(profile)
    if not job_description.strip():
        raise ValueError("Job description must not be empty")

    role_title = _role_title(job_description, target_title)

    if provider is None:
        matches, known_ids = _known_matches(profile, job_description)
        unknown = _unknown_skills(job_description, known_ids, profile, terms)
        return {
            "version": JD_PARSE_VERSION,
            "provider": "deterministic",
            "role_title": role_title,
            "seniority": _seniority(job_description, role_title),
            "must_have_skills": matches["must"],
            "nice_to_have_skills": matches["nice"],
            "unknown_skills": unknown,
            "keywords": _keywords(matches, unknown),
            "key_responsibilities": _responsibilities(job_description),
        }

    raw = provider.complete_json(_prompt(profile, job_description, target_title))
    must_names = [str(item) for item in raw.get("must_have_skills", [])]
    nice_names = [str(item) for item in raw.get("nice_to_have_skills", [])]
    must_rows, unknown_must = _skill_rows(must_names, terms)
    nice_rows, unknown_nice = _skill_rows(nice_names, terms)
    unknown = unknown_must + [item for item in unknown_nice if item not in unknown_must]
    return {
        "version": JD_PARSE_VERSION,
        "provider": getattr(provider, "name", provider.__class__.__name__.lower()),
        "role_title": str(raw.get("role_title") or target_title or "").strip(),
        "seniority": str(raw.get("seniority") or "not specified"),
        "must_have_skills": must_rows,
        "nice_to_have_skills": nice_rows,
        "unknown_skills": [{"name": item, "status": "unknown"} for item in unknown],
        "keywords": [str(item) for item in raw.get("keywords", [])][:20],
        "key_responsibilities": [str(item) for item in raw.get("key_responsibilities", [])][:12],
    }


def _keywords(matches: dict[str, list[dict]], unknown: list[dict[str, str]]) -> list[str]:
    values = [row["name"] for row in matches["must"]]
    values.extend(row["name"] for row in matches["nice"])
    values.extend(row["name"] for row in unknown)
    return list(dict.fromkeys(values))[:20]


def _prompt(
    profile: dict[str, Any], job_description: str, target_title: str | None
) -> str:
    aliases = {
        skill["name"]: skill.get("aliases", []) for skill in profile["skills"]
    }
    aliases = {
        skill["name"]: skill.get("aliases", []) for skill in profile["skills"]
    }
    return f"""Extract this job description into JSON.

Return exactly these keys:
- role_title: string
- seniority: string
- must_have_skills: array of strings
- nice_to_have_skills: array of strings
- keywords: array of strings
- key_responsibilities: array of strings

Normalize skills through this alias table when possible: {json.dumps(aliases, ensure_ascii=False)}
Keep unknown skills unchanged. Do not invent facts or merge distinct technologies.
Suggested target title: {target_title or "(not provided)"}

Job description:
{job_description}"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Parse a JD into normalized JSON")
    parser.add_argument("job_description_file", type=Path)
    parser.add_argument("--profile", type=Path, default=Path("master_profile.yaml"))
    parser.add_argument("--target-title")
    parser.add_argument("--provider", choices=("deterministic", "glm", "gemini"), default="deterministic")
    parser.add_argument("--json-output", type=Path)
    args = parser.parse_args(argv)

    profile = load_profile(args.profile)
    provider = None
    if args.provider != "deterministic":
        from .llm import make_provider

        provider = make_provider(args.provider)
    parsed = parse_job_description(
        profile,
        args.job_description_file.read_text(encoding="utf-8"),
        provider=provider,
        target_title=args.target_title,
    )
    output = json.dumps(parsed, ensure_ascii=False, indent=2) + "\n"
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
