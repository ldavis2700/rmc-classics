"""Exercise the exact RevenueCat lookup without importing provider-heavy server startup."""

import ast
import os
from pathlib import Path
import sys
import types
from typing import Optional
import unittest
from unittest.mock import patch
from urllib.parse import quote


SERVER = Path(__file__).resolve().parents[1] / "backend/server.py"


class _Logger:
    def warning(self, *args):
        return None


class _HTTPError(Exception):
    pass


class _Response:
    def __init__(self, payload=None, *, content=b"{}", status_code=200):
        self.payload = payload
        self.content = content
        self.status_code = status_code

    def json(self):
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload


class _Client:
    def __init__(self, state, response=None, error=None):
        self.state = state
        self.response = response
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, headers):
        self.state["url"] = url
        self.state["headers"] = headers
        if self.error:
            raise self.error
        return self.response


def _load_lookup():
    tree = ast.parse(SERVER.read_text(encoding="utf-8"))
    function = next(
        node for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef)
        and node.name == "_rc_get_subscriber"
    )
    namespace = {
        "Optional": Optional,
        "REVENUECAT_API_BASE": "https://api.revenuecat.com/v1",
        "logger": _Logger(),
        "os": os,
        "quote": quote,
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(SERVER), "exec"), namespace)
    return namespace["_rc_get_subscriber"]


class RevenueCatProviderBoundaryTests(unittest.IsolatedAsyncioTestCase):
    async def _call(self, *, response=None, error=None, user_id="user-1", secret="secret"):
        state = {}
        httpx = types.ModuleType("httpx")
        httpx.HTTPError = _HTTPError
        httpx.AsyncClient = lambda timeout: _Client(
            state,
            response=response,
            error=error,
        )
        with patch.dict(os.environ, {"REVENUECAT_SECRET_KEY": secret}, clear=False):
            with patch.dict(sys.modules, {"httpx": httpx}):
                result = await _load_lookup()(user_id)
        return result, state

    async def test_valid_subscriber_is_url_encoded_and_returned(self):
        result, state = await self._call(
            response=_Response({"subscriber": {"non_subscriptions": {}}}),
            user_id="account/with space?alias=other",
        )
        self.assertEqual(result, {"non_subscriptions": {}})
        self.assertTrue(state["url"].endswith(
            "/subscribers/account%2Fwith%20space%3Falias%3Dother"
        ))
        self.assertEqual(state["headers"]["Authorization"], "Bearer secret")

    async def test_missing_secret_fails_closed(self):
        result, state = await self._call(
            response=_Response({"subscriber": {}}),
            secret="",
        )
        self.assertIsNone(result)
        self.assertEqual(state, {})

    async def test_malformed_or_failed_provider_responses_fail_closed(self):
        cases = (
            _Response([], content=b"[]"),
            _Response({"subscriber": []}, content=b'{"subscriber":[]}'),
            _Response(ValueError("invalid"), content=b"{"),
            _Response({"subscriber": {}}, content=b"x" * 2_000_001),
            _Response({}, status_code=503),
        )
        for response in cases:
            with self.subTest(response=response):
                result, _state = await self._call(response=response)
                self.assertIsNone(result)

    async def test_transport_failure_fails_closed(self):
        result, _state = await self._call(error=_HTTPError("network"))
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
