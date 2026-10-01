"""Small provider interface for GLM and Gemini structured JSON calls."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


class LLMError(RuntimeError):
    pass


def _extract_json(text: str) -> dict[str, Any]:
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start < 0 or end < start:
        raise LLMError("Model response did not contain a JSON object")
    try:
        value = json.loads(candidate[start : end + 1])
    except json.JSONDecodeError as error:
        raise LLMError(f"Model returned invalid JSON: {error}") from error
    if not isinstance(value, dict):
        raise LLMError("Model JSON must be an object")
    return value


def _post_json(url: str, *, headers: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", **headers},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise LLMError(f"LLM request failed: {error}") from error


class GLMProvider:
    name = "glm"

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or next(
            (
                os.environ[name]
                for name in (
                    "GLM_API_KEY",
                    "ZAI_API_KEY",
                    "Z_AI_API_KEY",
                    "ZHIPU_API_KEY",
                )
                if os.environ.get(name)
            ),
            None,
        )
        self.model = model or os.environ.get("GLM_MODEL", "glm-4.6")
        if not self.api_key:
            raise LLMError("Set GLM_API_KEY (or ZAI_API_KEY) for --provider glm")

    def complete_json(self, prompt: str) -> dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "Return valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0,
        }
        response = _post_json(
            os.environ.get("GLM_API_URL", "https://api.z.ai/api/paas/v4/chat/completions"),
            headers={"Authorization": f"Bearer {self.api_key}"},
            payload=payload,
        )
        try:
            text = response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise LLMError(f"Unexpected GLM response: {response}") from error
        return _extract_json(text)


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or next(
            (
                os.environ[name]
                for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY")
                if os.environ.get(name)
            ),
            None,
        )
        self.model = model or os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        if not self.api_key:
            raise LLMError("Set GEMINI_API_KEY for --provider gemini")

    def complete_json(self, prompt: str) -> dict[str, Any]:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )
        response = _post_json(
            url,
            headers={"x-goog-api-key": self.api_key},
            payload={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0},
            },
        )
        try:
            text = response["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as error:
            raise LLMError(f"Unexpected Gemini response: {response}") from error
        return _extract_json(text)


def make_provider(name: str) -> Any:
    if name == "glm":
        return GLMProvider()
    if name == "gemini":
        return GeminiProvider()
    raise ValueError(f"Unknown LLM provider: {name}. Use glm or gemini.")
