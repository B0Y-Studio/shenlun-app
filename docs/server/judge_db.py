# docs/server/judge_db.py
"""AI 评卷后端：SQLite + Fernet 加解密 + 限流。
依赖：pip install cryptography
"""
import os
import sqlite3
import threading
import time
import uuid
from cryptography.fernet import Fernet

FERNET_KEY_ENV = 'JUDGE_FERNET_KEY'
KEY_FILE_NAME = '.fernet_key'
RATE_WINDOW_SEC = 60


class JudgeDB:
    def __init__(self, db_path: str, records_dir: str) -> None:
        self.db_path = db_path
        self.records_dir = records_dir
        self._lock = threading.Lock()
        self._rate: dict[str, list[float]] = {}
        self._fernet: Fernet | None = None
        self._key_path = os.path.join(records_dir, KEY_FILE_NAME)

    def init(self) -> None:
        os.makedirs(self.records_dir, exist_ok=True)
        self._fernet = self._load_or_create_fernet()
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS llm_config (
                    device_id    TEXT PRIMARY KEY,
                    provider     TEXT NOT NULL,
                    base_url     TEXT NOT NULL,
                    model        TEXT NOT NULL,
                    api_key_cipher TEXT NOT NULL,
                    updated_at   INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS judge_history (
                    id            TEXT PRIMARY KEY,
                    device_id     TEXT NOT NULL,
                    question_id   TEXT,
                    question_no   TEXT,
                    question_title TEXT,
                    question_score INTEGER,
                    question_body  TEXT,
                    user_answer    TEXT,
                    response_json  TEXT,
                    total_score    INTEGER,
                    created_at     INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_jh_device_time
                    ON judge_history (device_id, created_at DESC);
            """)
            conn.commit()
            conn.close()

    def _load_or_create_fernet(self) -> Fernet:
        env = os.environ.get(FERNET_KEY_ENV)
        if env:
            return Fernet(env.encode())
        if os.path.exists(self._key_path):
            with open(self._key_path, 'rb') as f:
                return Fernet(f.read())
        key = Fernet.generate_key()
        with open(self._key_path, 'wb') as f:
            f.write(key)
        os.chmod(self._key_path, 0o600)
        return Fernet(key)

    def save_config(self, device_id: str, provider: str, base_url: str, model: str, api_key: str) -> dict:
        cipher = self._fernet.encrypt(api_key.encode()).decode()
        now = int(time.time() * 1000)
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.execute("""
                INSERT INTO llm_config (device_id, provider, base_url, model, api_key_cipher, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(device_id) DO UPDATE SET
                    provider=excluded.provider,
                    base_url=excluded.base_url,
                    model=excluded.model,
                    api_key_cipher=excluded.api_key_cipher,
                    updated_at=excluded.updated_at
            """, (device_id, provider, base_url, model, cipher, now))
            conn.commit()
            conn.close()
        return {'provider': provider, 'base_url': base_url, 'model': model, 'updated_at': now}

    def get_config(self, device_id: str) -> dict | None:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            row = conn.execute(
                "SELECT provider, base_url, model, updated_at FROM llm_config WHERE device_id=?",
                (device_id,)
            ).fetchone()
            conn.close()
        if not row:
            return None
        return {
            'provider': row[0],
            'base_url': row[1],
            'model': row[2],
            'updated_at': row[3],
        }

    def _decrypt_key(self, device_id: str) -> str | None:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            row = conn.execute(
                "SELECT api_key_cipher FROM llm_config WHERE device_id=?",
                (device_id,)
            ).fetchone()
            conn.close()
        if not row:
            return None
        try:
            return self._fernet.decrypt(row[0].encode()).decode()
        except Exception:
            # key 文件损坏 / cipher 不匹配 → 强制清空重配
            self._reset_corrupt_config(device_id)
            return None

    def _reset_corrupt_config(self, device_id: str) -> None:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.execute("DELETE FROM llm_config WHERE device_id=?", (device_id,))
            conn.commit()
            conn.close()
        # 重置 .fernet_key 以保证下次能解密
        try:
            os.remove(self._key_path)
        except FileNotFoundError:
            pass
        self._fernet = self._load_or_create_fernet()

    def delete_config(self, device_id: str) -> bool:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            cur = conn.execute("DELETE FROM llm_config WHERE device_id=?", (device_id,))
            conn.commit()
            affected = cur.rowcount
            conn.close()
        return affected > 0

    def save_history(self, record: dict) -> str:
        hid = record.get('id') or f'cloud-{uuid.uuid4().hex[:16]}'
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            conn.execute("""
                INSERT INTO judge_history
                    (id, device_id, question_id, question_no, question_title, question_score,
                     question_body, user_answer, response_json, total_score, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                hid,
                record['device_id'],
                record.get('question_id', ''),
                record.get('question_no', ''),
                record.get('question_title', ''),
                record.get('question_score', 0),
                record.get('question_body', ''),
                record.get('user_answer', ''),
                record.get('response_json', ''),
                record.get('total_score', 0),
                record.get('created_at', int(time.time() * 1000)),
            ))
            conn.commit()
            conn.close()
        return hid

    def list_history(self, device_id: str, limit: int = 20) -> list:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            rows = conn.execute("""
                SELECT id, question_id, question_no, question_title, question_score,
                       total_score, created_at
                FROM judge_history
                WHERE device_id=?
                ORDER BY created_at DESC
                LIMIT ?
            """, (device_id, limit)).fetchall()
            conn.close()
        return [{
            'id': r[0],
            'question_id': r[1],
            'question_no': r[2],
            'question_title': r[3],
            'question_score': r[4],
            'total_score': r[5],
            'created_at': r[6],
        } for r in rows]

    def get_history(self, history_id: str) -> dict | None:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            row = conn.execute("""
                SELECT id, device_id, question_id, question_no, question_title, question_score,
                       question_body, user_answer, response_json, total_score, created_at
                FROM judge_history WHERE id=?
            """, (history_id,)).fetchone()
            conn.close()
        if not row:
            return None
        return {
            'id': row[0], 'device_id': row[1],
            'question_id': row[2], 'question_no': row[3],
            'question_title': row[4], 'question_score': row[5],
            'question_body': row[6], 'user_answer': row[7],
            'response_json': row[8], 'total_score': row[9],
            'created_at': row[10],
        }

    def delete_history(self, history_id: str, device_id: str) -> bool:
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            cur = conn.execute(
                "DELETE FROM judge_history WHERE id=? AND device_id=?",
                (history_id, device_id)
            )
            conn.commit()
            affected = cur.rowcount
            conn.close()
        return affected > 0

    def check_rate_limit(self, device_id: str, max_per_min: int = 5) -> bool:
        """返回 True = 允许，False = 超限"""
        now = time.time()
        with self._lock:
            arr = self._rate.setdefault(device_id, [])
            arr[:] = [t for t in arr if now - t < RATE_WINDOW_SEC]
            if len(arr) >= max_per_min:
                return False
            arr.append(now)
            return True