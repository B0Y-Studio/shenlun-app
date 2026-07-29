# docs/server/tests/test_judge_db.py
import os
import tempfile
from judge_db import JudgeDB

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