# docs/server/tests/test_judge_db.py
import os
import tempfile
from judge_db import JudgeDB, extract_json_by_brace_depth

def test_encrypt_decrypt_roundtrip():
    with tempfile.TemporaryDirectory() as tmp:
        db = JudgeDB(os.path.join(tmp, 'judge.db'), tmp)
        db.init()
        raw = 'sk-test-1234567890'
        enc = db._fernet.encrypt(raw.encode()).decode()
        assert enc != raw
        assert db._fernet.decrypt(enc.encode()).decode() == raw

def test_db_init_creates_tables():
    with tempfile.TemporaryDirectory() as tmp:
        db = JudgeDB(os.path.join(tmp, 'judge.db'), tmp)
        db.init()
        import sqlite3
        conn = sqlite3.connect(os.path.join(tmp, 'judge.db'))
        names = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table','index')"
        ).fetchall()}
        assert {'llm_config', 'judge_history', 'idx_jh_device_time'} <= names
        conn.close()

# extract_json_by_brace_depth — mirrors client-side `client.ts` parser.
# Server relies on this for _save_judge_history; testing it independently catches
# regressions that the integration tests (test_judge_run) would not surface.

def test_extract_no_brace():
    assert extract_json_by_brace_depth('hello world') is None

def test_extract_simple():
    assert extract_json_by_brace_depth('prefix {"a":1} suffix') == '{"a":1}'

def test_extract_nested():
    assert extract_json_by_brace_depth('x {"a":{"b":2},"c":3} y') == '{"a":{"b":2},"c":3}'

def test_extract_brace_inside_string():
    # Braces inside a quoted string must NOT close the outer object.
    assert extract_json_by_brace_depth('x {"a":"{not}"} y') == '{"a":"{not}"}'

def test_extract_escaped_quote():
    # Escaped quotes inside a string must not toggle the in-string state.
    assert extract_json_by_brace_depth('x {"a":"he said \\"hi\\""} y') == '{"a":"he said \\"hi\\""}'

def test_extract_unclosed():
    assert extract_json_by_brace_depth('x {"a":1') is None
