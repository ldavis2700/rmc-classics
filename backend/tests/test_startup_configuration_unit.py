"""Exercise real startup guards without opening a database or network connection."""
import ast
import asyncio
import os
from pathlib import Path
import unittest
from unittest.mock import patch


class ForbiddenDatabase:
    def __getattr__(self, name):
        raise AssertionError(f"Database touched before configuration validation: {name}")


source = ast.parse((Path(__file__).resolve().parents[1] / 'server.py').read_text())
functions = [node for node in source.body
             if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
             and node.name in ('validate_startup_configuration', 'startup')]
for node in functions:
    node.decorator_list = []
namespace = {'os': os, 'db': ForbiddenDatabase(), 'table_service': ForbiddenDatabase()}
exec(compile(ast.Module(body=functions, type_ignores=[]), 'server.py', 'exec'), namespace)


class StartupConfigurationTests(unittest.TestCase):
    def assert_startup_rejected(self, env, message):
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(RuntimeError, message):
                asyncio.run(namespace['startup']())

    def test_absent_or_blank_jwt_secret_rejected_before_database(self):
        for value in (None, '', ' ', '\t\n'):
            with self.subTest(value=value):
                env = {} if value is None else {'JWT_SECRET': value}
                self.assert_startup_rejected(env, 'JWT_SECRET')

    def test_incomplete_operator_rejected_before_database(self):
        for settings in ({'ADMIN_EMAIL': 'operator@example.invalid'},
                         {'ADMIN_PASSWORD': 'fixture-password'},
                         {'ADMIN_EMAIL': 'operator@example.invalid', 'ADMIN_PASSWORD': 'short'}):
            with self.subTest(settings=list(settings)):
                self.assert_startup_rejected({'JWT_SECRET': 'fixture-secret', **settings}, 'ADMIN_')

    def test_valid_configuration_preserves_exact_secret(self):
        secret = ' fixture-secret-with-preserved-whitespace '
        for operator in ({}, {'ADMIN_EMAIL': 'operator@example.invalid',
                             'ADMIN_PASSWORD': 'fixture-password'}):
            with patch.dict(os.environ, {'JWT_SECRET': secret, **operator}, clear=True):
                namespace['validate_startup_configuration']()
                self.assertEqual(os.environ['JWT_SECRET'], secret)


if __name__ == '__main__':
    unittest.main()
