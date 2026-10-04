import io
import unittest
import urllib.error
from unittest import mock

from resume_god.llm import (
    LLMError,
    _extract_json,
    _post_json,
)


class ExtractJsonTests(unittest.TestCase):
    def test_plain_object(self):
        self.assertEqual(_extract_json('{"a": 1}'), {"a": 1})

    def test_fenced_prose_wrapped(self):
        text = (
            'Here is the result:\n```json\n{"selected": ["x"]}\n```\nHope this helps!'
        )
        self.assertEqual(_extract_json(text), {"selected": ["x"]})

    def test_ignores_braces_in_strings_and_picks_first_object(self):
        text = 'note { not json } then {"b": "a { c }"} trailing {oops'
        self.assertEqual(_extract_json(text), {"b": "a { c }"})

    def test_rejects_arrays_and_prose(self):
        with self.assertRaises(LLMError):
            _extract_json("[]")
        with self.assertRaises(LLMError):
            _extract_json("no braces here")


class PostJsonRetryTests(unittest.TestCase):
    def _response(self, payload: bytes):
        stream = io.BytesIO(payload)
        context = mock.MagicMock()
        context.__enter__.return_value = stream
        context.__exit__.return_value = False
        return context

    def test_retries_transient_then_succeeds(self):
        error = urllib.error.HTTPError(
            "http://x", 503, "busy", {}, io.BytesIO(b"{}")
        )
        with mock.patch(
            "urllib.request.urlopen",
            side_effect=[error, error, self._response(b'{"ok": true}')],
        ) as opener, mock.patch("time.sleep") as sleeper:
            result = _post_json("http://x", headers={}, payload={})
        self.assertEqual(result, {"ok": True})
        self.assertEqual(opener.call_count, 3)
        self.assertEqual(
            [call.args[0] for call in sleeper.call_args_list], [1.0, 2.0]
        )

    def test_non_retryable_error_raises_without_sleep(self):
        error = urllib.error.HTTPError(
            "http://x", 400, "bad", {}, io.BytesIO(b"{}")
        )
        with mock.patch(
            "urllib.request.urlopen", side_effect=error
        ) as opener, mock.patch("time.sleep") as sleeper:
            with self.assertRaises(LLMError):
                _post_json("http://x", headers={}, payload={})
        self.assertEqual(opener.call_count, 1)
        sleeper.assert_not_called()

    def test_exhausted_retries_raise(self):
        error = urllib.error.HTTPError(
            "http://x", 429, "slow", {}, io.BytesIO(b"{}")
        )
        with mock.patch(
            "urllib.request.urlopen", side_effect=error
        ) as opener, mock.patch("time.sleep"):
            with self.assertRaises(LLMError):
                _post_json("http://x", headers={}, payload={})
        self.assertEqual(opener.call_count, 4)


if __name__ == "__main__":
    unittest.main()
