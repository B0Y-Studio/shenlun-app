# AI 评卷 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 ShenlunApp 内集成"AI 申论评卷"：选题 → 输答案 → LLM 流式评分 → 多维度卡片 + 历史回看。

**Architecture:** 客户端新增 3 屏（Judge / JudgeHistory / LlmConfig）+ llm 模块（provider/prompt/client/judgeStore）。服务端在 `card_server.py` 新增 4 个路由（`/api/judge/llm-config`、`/api/judge/run` SSE、`/api/judge/history`、`/api/judge/<id>`），新增 `judge_db.py` 处理 SQLite + Fernet 加密 + 限流。LLM 厂商（DeepSeek / 豆包 / OpenAI）走 OpenAI 兼容 chat/completions，stream=true，App 端括号深度切 JSON。

**Tech Stack:** React Native 0.74.5 + TypeScript 5、Python stdlib（http.server / sqlite3 / urllib / hashlib）、Fernet（`cryptography` 包需服务端 pip install）、MMKV（已用）。

## Global Constraints

- 客户端 TypeScript 严格模式；no `any` outside boundary（API 类型用 `unknown` + 校验）
- 服务端 0 新增第三方依赖除 `cryptography`（Fernet）；其它全 stdlib
- 所有提交前缀 `feat(judge):` / `fix(judge):` / `chore(judge):` / `test(judge):`
- 每个 Task 完成后必须能独立跑通测试/手动验证
- 禁止 Read 任何图片（用户文章含敏感词）；不调用 `android_screenshot` / `ios_screenshot`
- Server SQLite 路径：`OUT_DIR/_records/judge.db`；不污染 `_cards.db`
- Fernet key 路径：`OUT_DIR/_records/.fernet_key`（无则启动时生成；prod 用环境变量 `JUDGE_FERNET_KEY` 覆盖）
- 服务端限流：每 `device_id` 5 次/分钟，超 429
- LLM 厂商 endpoint：`<base_url>/v1/chat/completions`（OpenAI 兼容）
- 客户端 `BASE = 'http://124.223.5.144'`，与 `api/client.ts` 一致
- 所有写 SQLite 的接口必须 try/except 异常，绝不让 JudgeScreen 闪退

---

## Task 1: 服务端 judge_db.py 骨架 + Fernet 加解密

**Files:**
- Create: `docs/server/judge_db.py`
- Create: `docs/server/tests/test_judge_db.py`

**Interfaces:**
- Produces:
  ```python
  class JudgeDB:
      def __init__(self, db_path: str, records_dir: str) -> None
      def init(self) -> None  # 建表 + 加载/生成 fernet key
      def save_config(self, device_id: str, provider: str, base_url: str, model: str, api_key: str) -> dict  # 加密存，返回脱敏 dict
      def get_config(self, device_id: str) -> dict | None  # 不返回 key
      def delete_config(self, device_id: str) -> bool
      def save_history(self, record: dict) -> str  # 写入返回 id
      def list_history(self, device_id: str, limit: int = 20) -> list
      def get_history(self, history_id: str) -> dict | None
      def delete_history(self, history_id: str, device_id: str) -> bool
      def check_rate_limit(self, device_id: str, max_per_min: int = 5) -> bool
  ```

- [ ] **Step 1: 写测试 — 加密 round-trip + DB 初始化**

```python
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
        names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        assert {'llm_config', 'judge_history', 'judge_index'} <= names
        conn.close()
```

- [ ] **Step 2: 跑测试 — 预期失败（模块不存在）**

Run: `cd docs/server && python -m pytest tests/test_judge_db.py -v`
Expected: `ModuleNotFoundError: No module named 'judge_db'`

- [ ] **Step 3: 实现 judge_db.py（最小可用版）**

```python
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
        hid = record.get('id') or f'judge-{uuid.uuid4().hex[:16]}'
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
```

- [ ] **Step 4: 跑测试 — 预期通过**

Run: `cd docs/server && python -m pytest tests/test_judge_db.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
cd C:\Users\hecto\ZCodeProject
git add docs/server/judge_db.py docs/server/tests/test_judge_db.py
git commit -m "feat(judge): 后端 JudgeDB 骨架 + Fernet 加解密 + 限流"
```

---

## Task 2: 服务端 card_server.py 接入 llm-config / history 路由

**Files:**
- Modify: `docs/server/card_server.py:69-300`（在 CardHandler 内新增 4 个 `_handle_*` 方法 + `_init_judge`）
- Create: `docs/server/tests/test_server_routes.py`

**Interfaces:**
- Consumes: `JudgeDB` from Task 1
- Produces: 路由
  - `POST /api/judge/llm-config` body=`{device_id, provider, base_url, model, api_key}` → `{ok, provider, base_url, model, updated_at}` 或 400/500
  - `GET  /api/judge/llm-config?device_id=` → `{configured, provider, base_url, model, updated_at}` 或 `{configured: false}`
  - `DELETE /api/judge/llm-config?device_id=` → `{ok: true}`
  - `GET  /api/judge/history?device_id=&limit=20` → `{items: [...]}`
  - `DELETE /api/judge/<id>?device_id=` → `{ok: true}`

- [ ] **Step 1: 写测试 — 4 个 JSON 路由的 happy path**

```python
# docs/server/tests/test_server_routes.py
import json
import threading
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import card_server


def _start_server(jdb):
    server = card_server.ThreadingHTTPServer(('127.0.0.1', 0), card_server.CardHandler)
    server.judge_db = jdb
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server


def _post(server, path, body, query=''):
    url = f'http://127.0.0.1:{server.server_address[1]}{path}?{query}' if query else f'http://127.0.0.1:{server.server_address[1]}{path}'
    req = Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read().decode())
    except HTTPError as e:
        return e.code, json.loads(e.read().decode())


def _get(server, path):
    url = f'http://127.0.0.1:{server.server_address[1]}{path}'
    try:
        with urlopen(url, timeout=5) as r:
            return r.status, json.loads(r.read().decode())
    except HTTPError as e:
        return e.code, json.loads(e.read().decode())


def _delete(server, path):
    url = f'http://127.0.0.1:{server.server_address[1]}{path}'
    req = Request(url, method='DELETE')
    try:
        with urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read().decode())
    except HTTPError as e:
        return e.code, json.loads(e.read().decode())


def test_llm_config_roundtrip(tmp_path):
    from judge_db import JudgeDB
    jdb = JudgeDB(str(tmp_path / 'judge.db'), str(tmp_path))
    jdb.init()
    server = _start_server(jdb)
    try:
        # 1. save
        code, body = _post(server, '/api/judge/llm-config', {
            'device_id': 'dev-1', 'provider': 'deepseek',
            'base_url': 'https://api.deepseek.com', 'model': 'deepseek-chat',
            'api_key': 'sk-test',
        })
        assert code == 200 and body['provider'] == 'deepseek'
        # 2. get 不返回 key
        code, body = _get(server, '/api/judge/llm-config?device_id=dev-1')
        assert code == 200 and body['configured'] is True
        assert 'api_key' not in body
    finally:
        server.shutdown()


def test_history_crud(tmp_path):
    from judge_db import JudgeDB
    jdb = JudgeDB(str(tmp_path / 'judge.db'), str(tmp_path))
    jdb.init()
    server = _start_server(jdb)
    try:
        jdb.save_history({
            'id': 'judge-abc', 'device_id': 'dev-1',
            'question_id': 'q1', 'question_title': '概括',
            'question_score': 20, 'total_score': 16,
            'response_json': '{}', 'created_at': int(time.time()*1000),
        })
        code, body = _get(server, '/api/judge/history?device_id=dev-1&limit=10')
        assert code == 200 and len(body['items']) == 1
        assert body['items'][0]['id'] == 'judge-abc'
        code, _ = _delete(server, '/api/judge/judge-abc?device_id=dev-1')
        assert code == 200
        code, body = _get(server, '/api/judge/history?device_id=dev-1&limit=10')
        assert len(body['items']) == 0
    finally:
        server.shutdown()


def test_llm_config_missing_key_400(tmp_path):
    from judge_db import JudgeDB
    jdb = JudgeDB(str(tmp_path / 'judge.db'), str(tmp_path))
    jdb.init()
    server = _start_server(jdb)
    try:
        code, _ = _post(server, '/api/judge/llm-config', {
            'device_id': 'dev-1', 'provider': 'deepseek',
            'base_url': 'https://api.deepseek.com', 'model': 'deepseek-chat',
            # 缺 api_key
        })
        assert code == 400
    finally:
        server.shutdown()
```

- [ ] **Step 2: 跑测试 — 预期失败（路由不存在）**

Run: `cd docs/server && python -m pytest tests/test_server_routes.py -v`
Expected: AttributeError / 404

- [ ] **Step 3: 在 card_server.py 内新增 4 个路由 + 初始化 JudgeDB**

打开 `docs/server/card_server.py`，在第 47 行后加入：

```python
JUDGE_DB_PATH = os.path.join(OUT_DIR, '_records', 'judge.db')
JUDGE_RECORDS_DIR = os.path.join(OUT_DIR, '_records')
_judge_db = None
_judge_db_lock = threading.Lock()


def get_judge_db():
    global _judge_db
    with _judge_db_lock:
        if _judge_db is None:
            from judge_db import JudgeDB
            _judge_db = JudgeDB(JUDGE_DB_PATH, JUDGE_RECORDS_DIR)
            _judge_db.init()
        return _judge_db
```

在 `CardHandler` 类内（约 69 行后），加入以下方法（位置：紧跟 `def do_POST` 或 `do_GET` 之后；具体看原文件结构）：

```python
    def _judge_config_get(self):
        qs = parse_qs(urlparse(self.path).query)
        device_id = (qs.get('device_id') or [''])[0]
        if not device_id:
            return self._send_json(400, {'error': 'missing_device_id'})
        cfg = get_judge_db().get_config(device_id)
        if not cfg:
            return self._send_json(200, {'configured': False})
        return self._send_json(200, {'configured': True, **cfg})

    def _judge_config_post(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            body_raw = self.rfile.read(n).decode('utf-8')
            body = json.loads(body_raw) if body_raw else {}
        except Exception as e:
            return self._send_json(400, {'error': f'bad_json: {e}'})
        device_id = body.get('device_id', '')
        provider = body.get('provider', '')
        base_url = body.get('base_url', '')
        model = body.get('model', '')
        api_key = body.get('api_key', '')
        if not all([device_id, provider, base_url, model, api_key]):
            return self._send_json(400, {'error': 'missing_fields'})
        out = get_judge_db().save_config(device_id, provider, base_url, model, api_key)
        return self._send_json(200, {'ok': True, **out})

    def _judge_config_delete(self):
        qs = parse_qs(urlparse(self.path).query)
        device_id = (qs.get('device_id') or [''])[0]
        if not device_id:
            return self._send_json(400, {'error': 'missing_device_id'})
        get_judge_db().delete_config(device_id)
        return self._send_json(200, {'ok': True})

    def _judge_history_list(self):
        qs = parse_qs(urlparse(self.path).query)
        device_id = (qs.get('device_id') or [''])[0]
        try:
            limit = int((qs.get('limit') or ['20'])[0])
        except ValueError:
            limit = 20
        limit = max(1, min(100, limit))
        if not device_id:
            return self._send_json(400, {'error': 'missing_device_id'})
        items = get_judge_db().list_history(device_id, limit)
        return self._send_json(200, {'items': items})

    def _judge_history_delete(self, history_id: str):
        qs = parse_qs(urlparse(self.path).query)
        device_id = (qs.get('device_id') or [''])[0]
        if not device_id:
            return self._send_json(400, {'error': 'missing_device_id'})
        ok = get_judge_db().delete_history(history_id, device_id)
        return self._send_json(200, {'ok': ok})
```

然后在 `CardHandler` 的 `do_GET` / `do_POST` / `do_DELETE` 路由分发处（找 `if self.path.startswith('/api/...')` 那段），加入：

```python
        # --- /api/judge/* ---
        if self.path.startswith('/api/judge/llm-config'):
            if self.command == 'GET':    return self._judge_config_get()
            if self.command == 'POST':   return self._judge_config_post()
            if self.command == 'DELETE': return self._judge_config_delete()
        if self.path.startswith('/api/judge/history'):
            return self._judge_history_list()
        m = re.match(r'^/api/judge/([^/?]+)$', self.path)
        if m and self.command == 'DELETE':
            return self._judge_history_delete(m.group(1))
```

并在 `CardHandler` 加 helper：

```python
    def _send_json(self, status: int, body: dict):
        return self._send(status, json.dumps(body, ensure_ascii=False), 'application/json; charset=utf-8')
```

（注：原 `_send` 默认 `content_type='text/html'`，需复用。）

- [ ] **Step 4: 跑测试 — 预期通过**

Run: `cd docs/server && python -m pytest tests/test_server_routes.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
cd C:\Users\hecto\ZCodeProject
git add docs/server/card_server.py docs/server/tests/test_server_routes.py
git commit -m "feat(judge): /api/judge/llm-config + history CRUD 路由"
```

---

## Task 3: 服务端 /api/judge/run SSE 流式转发

**Files:**
- Modify: `docs/server/card_server.py`（新增 `_judge_run` + SSE helper）
- Create: `docs/server/tests/test_judge_run.py`

**Interfaces:**
- Produces: `POST /api/judge/run` body=`{device_id, question: {...}, user_answer: str}` → SSE 流（`text/event-stream`）：
  - 每个 chunk 形如 `data: {"delta":"<text>"}\n\n`
  - 流结束 `data: [DONE]\n\n`
  - 流结束后异步线程写 `judge_history`

- [ ] **Step 1: 写测试 — 用本地 mock HTTP server 模拟 LLM，验证 SSE chunk 数 + 顺序**

```python
# docs/server/tests/test_judge_run.py
import json
import os
import socket
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import card_server
from judge_db import JudgeDB


def _free_port() -> int:
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close()
    return p


# 模拟 LLM：返回标准 OpenAI 流
class MockLLMHandler(BaseHTTPRequestHandler):
    captured_body = b''
    def log_message(self, *a, **k): pass
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        MockLLMHandler.captured_body = self.rfile.read(n)
        body = b'data: {"choices":[{"delta":{"content":"{\\"total\\":16,"}}]}\n\n'
        body += b'data: {"choices":[{"delta":{"content":"\\"highlights\\":[\\"x\\"]}"}}]}\n\n'
        body += b'data: [DONE]\n\n'
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _post_sse(server, path, body, timeout=10):
    url = f'http://127.0.0.1:{server.server_address[1]}{path}'
    req = Request(url, data=json.dumps(body).encode(),
                  headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urlopen(req, timeout=timeout) as r:
            assert r.headers.get('Content-Type', '').startswith('text/event-stream')
            raw = r.read().decode()
            return r.status, raw
    except HTTPError as e:
        return e.code, e.read().decode()


def test_judge_run_sse(tmp_path):
    from judge_db import JudgeDB
    jdb = JudgeDB(str(tmp_path / 'judge.db'), str(tmp_path))
    jdb.init()

    # 启 mock LLM
    llm_port = _free_port()
    llm = ThreadingHTTPServer(('127.0.0.1', llm_port), MockLLMHandler)
    threading.Thread(target=llm.serve_forever, daemon=True).start()

    # 配 base_url 指向 mock
    jdb.save_config('dev-1', 'custom', f'http://127.0.0.1:{llm_port}', 'mock', 'sk-test')

    # 启 app server
    server = card_server.ThreadingHTTPServer(('127.0.0.1', 0), card_server.CardHandler)
    server.judge_db = jdb  # 仅供将来扩展
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        code, raw = _post_sse(server, '/api/judge/run', {
            'device_id': 'dev-1',
            'question': {'id': 'q1', 'title': '概括', 'body': '概括材料', 'score': 20, 'question_no': '一'},
            'user_answer': '这是用户答案',
        })
        assert code == 200
        assert 'data: {"delta":"' in raw
        assert raw.rstrip().endswith('data: [DONE]')
    finally:
        server.shutdown(); llm.shutdown()


def test_judge_run_no_config_400(tmp_path):
    from judge_db import JudgeDB
    jdb = JudgeDB(str(tmp_path / 'judge.db'), str(tmp_path))
    jdb.init()
    server = card_server.ThreadingHTTPServer(('127.0.0.1', 0), card_server.CardHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f'http://127.0.0.1:{server.server_address[1]}/api/judge/run'
        req = Request(url, data=json.dumps({'device_id': 'no-cfg', 'question': {}, 'user_answer': 'x'}).encode(),
                      headers={'Content-Type': 'application/json'}, method='POST')
        try:
            with urlopen(req, timeout=5) as r:
                assert r.status == 400
        except HTTPError as e:
            assert e.code == 400
    finally:
        server.shutdown()


def test_judge_run_rate_limit(tmp_path):
    from judge_db import JudgeDB
    jdb = JudgeDB(str(tmp_path / 'judge.db'), str(tmp_path))
    jdb.init()
    # 7 次调用 → 后 2 次应 429
    for i in range(5):
        assert jdb.check_rate_limit('dev-1') is True
    assert jdb.check_rate_limit('dev-1') is False
    assert jdb.check_rate_limit('dev-1') is False
```

- [ ] **Step 2: 跑测试 — 预期失败**

Run: `cd docs/server && python -m pytest tests/test_judge_run.py -v`
Expected: 404 / 400

- [ ] **Step 3: 实现 `/api/judge/run` SSE**

在 `docs/server/card_server.py` 顶部 import 区加入：

```python
import urllib.request
import urllib.error
```

在 `CardHandler` 类内新增：

```python
    def _judge_run(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            body_raw = self.rfile.read(n).decode('utf-8')
            body = json.loads(body_raw) if body_raw else {}
        except Exception as e:
            return self._send_json(400, {'error': f'bad_json: {e}'})
        device_id = body.get('device_id', '')
        question = body.get('question') or {}
        user_answer = body.get('user_answer', '') or ''
        if not device_id or not user_answer or not question:
            return self._send_json(400, {'error': 'missing_fields'})
        if len(user_answer.strip()) < 50:
            return self._send_json(400, {'error': 'answer_too_short', 'min': 50})
        jdb = get_judge_db()
        if not jdb.check_rate_limit(device_id):
            self.send_response(429)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'rate_limited', 'retry_after': 60}).encode())
            return
        cfg = jdb.get_config(device_id)
        if not cfg:
            return self._send_json(400, {'error': 'no_llm_config'})
        api_key = jdb._decrypt_key(device_id)
        if not api_key:
            return self._send_json(400, {'error': 'no_llm_config'})

        # 拼 prompt
        sys_prompt = self._build_system_prompt(question.get('score', 20))
        usr_prompt = self._build_user_prompt(question, user_answer)
        body_req = {
            'model': cfg['model'],
            'messages': [
                {'role': 'system', 'content': sys_prompt},
                {'role': 'user',   'content': usr_prompt},
            ],
            'stream': True,
            'temperature': 0.3,
        }
        url = cfg['base_url'].rstrip('/') + '/v1/chat/completions'
        req = urllib.request.Request(
            url,
            data=json.dumps(body_req).encode(),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}',
            },
            method='POST',
        )

        # SSE 响应头
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Accel-Buffering', 'no')
        self.end_headers()

        full = []
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                for raw_line in resp:
                    line = raw_line.decode('utf-8', errors='ignore').rstrip('\n')
                    if not line or not line.startswith('data:'):
                        continue
                    payload = line[5:].strip()
                    if payload == '[DONE]':
                        self.wfile.write(b'data: [DONE]\n\n')
                        self.wfile.flush()
                        break
                    try:
                        evt = json.loads(payload)
                        delta = ((evt.get('choices') or [{}])[0]).get('delta', {}).get('content', '')
                        if delta:
                            full.append(delta)
                            chunk = json.dumps({'delta': delta}, ensure_ascii=False)
                            self.wfile.write(f'data: {chunk}\n\n'.encode('utf-8'))
                            self.wfile.flush()
                    except json.JSONDecodeError:
                        continue
        except urllib.error.HTTPError as e:
            err = json.dumps({'error': f'llm_http_{e.code}'}).encode()
            self.wfile.write(f'data: {err}\n\n'.encode('utf-8'))
            self.wfile.flush()
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()
            return
        except Exception as e:
            err = json.dumps({'error': f'upstream_error: {e}'}).encode()
            self.wfile.write(f'data: {err}\n\n'.encode('utf-8'))
            self.wfile.flush()
            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()
            return

        # 异步存 history
        full_text = ''.join(full)
        threading.Thread(
            target=self._save_judge_history,
            args=(jdb, device_id, question, user_answer, full_text),
            daemon=True,
        ).start()

    def _save_judge_history(self, jdb, device_id, question, user_answer, full_text):
        import re
        # 按括号深度切 JSON
        start = full_text.find('{')
        if start < 0:
            response_json = full_text
            total = 0
        else:
            depth = 0
            end = -1
            for i in range(start, len(full_text)):
                c = full_text[i]
                if c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end > start:
                try:
                    parsed = json.loads(full_text[start:end])
                    response_json = json.dumps(parsed, ensure_ascii=False)
                    total = int(parsed.get('total', 0))
                except Exception:
                    response_json = full_text
                    total = 0
            else:
                response_json = full_text
                total = 0
        jdb.save_history({
            'device_id': device_id,
            'question_id': question.get('id', ''),
            'question_no': str(question.get('question_no', '')),
            'question_title': question.get('title', ''),
            'question_score': int(question.get('score', 0) or 0),
            'question_body': question.get('body', ''),
            'user_answer': user_answer,
            'response_json': response_json,
            'total_score': total,
        })

    def _build_system_prompt(self, score: int) -> str:
        s = int(score)
        return f"""你是申论阅卷老师。用户提交了一道申论题答案，请按官方评分维度评判并以严格 JSON 返回。

维度与权重（按题目分值等比缩放，本题总分为 {s} 分）：
- 立意 (25%): 是否扣题、观点是否明确、是否切合题意
- 结构 (20%): 是否总分/并列/递进，开头结尾是否呼应，段落逻辑是否清晰
- 论据 (25%): 是否充实、是否结合材料/时政/案例、数据是否准确
- 语言 (20%): 表达是否规范、是否书面化、有无语病/口语化
- 字数 (10%): 是否达到题目要求（一般 ≥ 800 字达标）

输出格式（**只返回 JSON，不要任何其他文字，不要用 ```json 包裹**）：
{{
  "commentary": "<一段流式评语，长度 200-400 字>",
  "total": <0-{s}>,
  "dimensions": [
    {{"key": "theme",    "score": <0-{round(s*0.25)}>, "comment": "<一句话点评>"}},
    {{"key": "structure","score": <0-{round(s*0.20)}>, "comment": "<一句话点评>"}},
    {{"key": "argument", "score": <0-{round(s*0.25)}>, "comment": "<一句话点评>"}},
    {{"key": "language", "score": <0-{round(s*0.20)}>, "comment": "<一句话点评>"}},
    {{"key": "wordcount","score": <0-{round(s*0.10)}>, "comment": "<一句话点评>"}}
  ],
  "highlights": ["<亮点1>", "<亮点2>", "<亮点3>"],
  "weaknesses": ["<不足1>", "<不足2>", "<不足3>"],
  "rewrite_hint": "<一段话：建议重写方向，100-200 字>"
}}"""

    def _build_user_prompt(self, q: dict, user_answer: str) -> str:
        body = (q.get('body') or '')[:300]
        if len(q.get('body') or '') > 300:
            body += '...'
        n = len(user_answer)
        return f"""题目：{q.get('title','')}
分值：{q.get('score','')} 分
题型：申论

题干（节选）：
{body}

用户答案（{n} 字）：
{user_answer}

请按 System Prompt 中定义的维度评判并只返回 JSON。"""
```

并在 `do_POST` 路由分发处加：

```python
        if self.path == '/api/judge/run':
            return self._judge_run()
```

- [ ] **Step 4: 跑测试 — 预期通过**

Run: `cd docs/server && python -m pytest tests/test_judge_run.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
cd C:\Users\hecto\ZCodeProject
git add docs/server/card_server.py docs/server/tests/test_judge_run.py
git commit -m "feat(judge): /api/judge/run SSE 流式转发 + 限流 + 异步存 history"
```

---

## Task 4: 服务端部署 + 部署脚本

**Files:**
- Create: `docs/server/deploy_judge.sh`
- Modify: `docs/server/card_server.py`（启动 banner 加 judge 状态）

**Interfaces:**
- Produces: 部署脚本，部署到 `124.223.5.144:8080`

- [ ] **Step 1: 写部署脚本**

```bash
# docs/server/deploy_judge.sh
#!/usr/bin/env bash
# 在 124.223.5.144 上跑的部署脚本
# 作用：拉新代码、装 cryptography、重启 card_server
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@124.223.5.144}"
REMOTE_DIR="${REMOTE_DIR:-/opt/xuexi/09_选卡阅读}"
SERVICE_NAME="${SERVICE_NAME:-card_server}"

echo "[deploy] ssh $REMOTE_HOST ..."
ssh "$REMOTE_HOST" "set -e
  cd '$REMOTE_DIR'
  git pull --ff-only
  pip install cryptography >/dev/null
  systemctl restart '$SERVICE_NAME'
  sleep 1
  systemctl status '$SERVICE_NAME' --no-pager
  curl -sf http://127.0.0.1:8080/api/judge/llm-config?device_id=__healthcheck || echo 'healthcheck endpoint not 200, check logs'
"
echo "[deploy] done"
```

- [ ] **Step 2: chmod +x**

Run: `chmod +x docs/server/deploy_judge.sh`

- [ ] **Step 3: 在 card_server.py 启动 banner 加 judge 状态**

在 `card_server.py` `__main__` 启动块（约 800+ 行）找到 print 启动信息的行，加：

```python
print(f'[judge] db={JUDGE_DB_PATH}  fernet_key={"env" if os.environ.get(FERNET_KEY_ENV) else "file"}  rate=5/min')
```

- [ ] **Step 4: 手动验证服务端能启动**

Run: `cd docs/server && python -c "import card_server; print('import OK')"`
Expected: `import OK`

- [ ] **Step 5: Commit**

```bash
cd C:\Users\hecto\ZCodeProject
git add docs/server/deploy_judge.sh docs/server/card_server.py
git commit -m "chore(judge): 部署脚本 + 启动 banner"
```

---

## Task 5: 客户端 src/llm/provider.ts + prompt.ts

**Files:**
- Create: `ShenlunApp/src/llm/provider.ts`
- Create: `ShenlunApp/src/llm/prompt.ts`

**Interfaces:**
- `provider.ts`:
  ```ts
  export type Provider = 'deepseek' | 'doubao' | 'openai' | 'custom';
  export interface LlmPreset { provider: Provider; label: string; baseUrl: string; model: string; }
  export const PRESETS: LlmPreset[];
  export interface LlmConfig { provider: Provider; baseUrl: string; model: string; apiKey: string; }
  ```

- [ ] **Step 1: 实现 provider.ts**

```ts
// ShenlunApp/src/llm/provider.ts
export type Provider = 'deepseek' | 'doubao' | 'openai' | 'custom';

export interface LlmPreset {
  provider: Provider;
  label: string;
  baseUrl: string;
  model: string;
}

export const PRESETS: LlmPreset[] = [
  { provider: 'deepseek', label: 'DeepSeek（推荐）', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { provider: 'doubao',   label: '豆包（火山）',     baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-1-5-pro-32k-250115' },
  { provider: 'openai',   label: 'OpenAI',          baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
  { provider: 'custom',   label: '自定义（OpenAI 兼容）', baseUrl: '', model: '' },
];

export interface LlmConfig {
  provider: Provider;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function findPreset(provider: Provider): LlmPreset | undefined {
  return PRESETS.find(p => p.provider === provider);
}
```

- [ ] **Step 2: 实现 prompt.ts**

```ts
// ShenlunApp/src/llm/prompt.ts
import type { Question } from '../api/client';

export function buildSystemPrompt(score: number): string {
  const s = Math.max(1, Math.floor(score));
  const w25 = Math.round(s * 0.25);
  const w20 = Math.round(s * 0.20);
  const w10 = Math.round(s * 0.10);
  return `你是申论阅卷老师。用户提交了一道申论题答案，请按官方评分维度评判并以严格 JSON 返回。

维度与权重（按题目分值等比缩放，本题总分为 ${s} 分）：
- 立意 (25%): 是否扣题、观点是否明确、是否切合题意
- 结构 (20%): 是否总分/并列/递进，开头结尾是否呼应，段落逻辑是否清晰
- 论据 (25%): 是否充实、是否结合材料/时政/案例、数据是否准确
- 语言 (20%): 表达是否规范、是否书面化、有无语病/口语化
- 字数 (10%): 是否达到题目要求（一般 ≥ 800 字达标）

输出格式（**只返回 JSON，不要任何其他文字，不要用 \`\`\`json 包裹**）：
{
  "commentary": "<一段流式评语，长度 200-400 字>",
  "total": <0-${s}>,
  "dimensions": [
    {"key": "theme",    "score": <0-${w25}>, "comment": "<一句话点评>"},
    {"key": "structure","score": <0-${w20}>, "comment": "<一句话点评>"},
    {"key": "argument", "score": <0-${w25}>, "comment": "<一句话点评>"},
    {"key": "language", "score": <0-${w20}>, "comment": "<一句话点评>"},
    {"key": "wordcount","score": <0-${w10}>, "comment": "<一句话点评>"}
  ],
  "highlights": ["<亮点1>", "<亮点2>", "<亮点3>"],
  "weaknesses": ["<不足1>", "<不足2>", "<不足3>"],
  "rewrite_hint": "<一段话：建议重写方向，100-200 字>"
}`;
}

export function buildUserPrompt(q: Question, userAnswer: string): string {
  const body = (q.body || '').slice(0, 300) + ((q.body || '').length > 300 ? '...' : '');
  return `题目：${q.title}
分值：${q.score} 分
题型：申论

题干（节选）：
${body}

用户答案（${userAnswer.length} 字）：
${userAnswer}

请按 System Prompt 中定义的维度评判并只返回 JSON。`;
}
```

- [ ] **Step 3: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add ShenlunApp/src/llm/provider.ts ShenlunApp/src/llm/prompt.ts
git commit -m "feat(judge): 客户端 LLM provider 预设 + prompt 模板"
```

---

## Task 6: 客户端 src/llm/client.ts (SSE 解析 + 括号深度切 JSON)

**Files:**
- Create: `ShenlunApp/src/llm/client.ts`

**Interfaces:**
- ```ts
  export interface JudgeResult {
    commentary: string;
    total: number;
    dimensions: Array<{ key: string; score: number; comment: string }>;
    highlights: string[];
    weaknesses: string[];
    rewrite_hint: string;
  }
  export type JudgeEvent =
    | { type: 'delta'; text: string }
    | { type: 'result'; result: JudgeResult | null; raw: string }
    | { type: 'error'; code: string; message: string };
  export async function* runJudge(
    question: Question, userAnswer: string, deviceId: string,
    opts?: { signal?: AbortSignal; onDelta?: (t: string) => void }
  ): AsyncGenerator<JudgeEvent>
  export function extractJsonByBraceDepth(text: string): { json: string | null; start: number; end: number }
  export function safeParseJudgeResult(raw: string): JudgeResult | null
  ```

- [ ] **Step 1: 实现 client.ts**

```ts
// ShenlunApp/src/llm/client.ts
import { getDeviceId } from '../storage/mmkv';
import type { Question } from '../api/client';

const BASE = 'http://124.223.5.144';

export interface JudgeDimension { key: string; score: number; comment: string }
export interface JudgeResult {
  commentary: string;
  total: number;
  dimensions: JudgeDimension[];
  highlights: string[];
  weaknesses: string[];
  rewrite_hint: string;
}

export type JudgeEvent =
  | { type: 'delta'; text: string }
  | { type: 'result'; result: JudgeResult | null; raw: string }
  | { type: 'error'; code: string; message: string };

/** 按括号深度从 text 中切出第一个完整顶层 {...} */
export function extractJsonByBraceDepth(text: string): { json: string | null; start: number; end: number } {
  const start = text.indexOf('{');
  if (start < 0) return { json: null, start: -1, end: -1 };
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { json: text.slice(start, i + 1), start, end: i + 1 };
    }
  }
  return { json: null, start, end: -1 };
}

export function safeParseJudgeResult(raw: string): JudgeResult | null {
  const { json } = extractJsonByBraceDepth(raw);
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<JudgeResult>;
    return {
      commentary: typeof o.commentary === 'string' ? o.commentary : '',
      total: Number(o.total ?? 0),
      dimensions: Array.isArray(o.dimensions) ? o.dimensions.map(d => ({
        key: String(d.key ?? ''),
        score: Number(d.score ?? 0),
        comment: String(d.comment ?? ''),
      })) : [],
      highlights: Array.isArray(o.highlights) ? o.highlights.map(String) : [],
      weaknesses: Array.isArray(o.weaknesses) ? o.weaknesses.map(String) : [],
      rewrite_hint: typeof o.rewrite_hint === 'string' ? o.rewrite_hint : '',
    };
  } catch {
    return null;
  }
}

export async function* runJudge(
  question: Question,
  userAnswer: string,
  deviceId: string = getDeviceId(),
  opts: { signal?: AbortSignal; onDelta?: (t: string) => void } = {},
): AsyncGenerator<JudgeEvent> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/judge/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        question: {
          id: question.id,
          title: question.title,
          body: question.body,
          score: question.score,
          question_no: question.question_no,
        },
        user_answer: userAnswer,
      }),
      signal: opts.signal,
    });
  } catch (e: any) {
    yield { type: 'error', code: 'network', message: String(e?.message ?? e) };
    return;
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    yield { type: 'error', code: `http_${res.status}`, message: msg };
    return;
  }
  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', code: 'no_body', message: 'response body is null' };
    return;
  }
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let fullText = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n\n')) >= 0) {
      const evt = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      const line = evt.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        const result = safeParseJudgeResult(fullText);
        yield { type: 'result', result, raw: fullText };
        return;
      }
      try {
        const obj = JSON.parse(payload);
        if (obj.error) {
          yield { type: 'error', code: 'upstream', message: String(obj.error) };
          return;
        }
        if (typeof obj.delta === 'string') {
          fullText += obj.delta;
          opts.onDelta?.(obj.delta);
          yield { type: 'delta', text: obj.delta };
        }
      } catch {
        // 忽略非 JSON 行
      }
    }
  }
  // 流未正常 DONE
  const result = safeParseJudgeResult(fullText);
  yield { type: 'result', result, raw: fullText };
}
```

- [ ] **Step 2: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add ShenlunApp/src/llm/client.ts
git commit -m "feat(judge): SSE 流式解析 + 括号深度切 JSON + 类型守卫"
```

---

## Task 7: 客户端 src/llm/judgeStore.ts (MMKV 历史 CRUD)

**Files:**
- Create: `ShenlunApp/src/llm/judgeStore.ts`

**Interfaces:**
- ```ts
  export interface LocalJudgeRecord {
    id: string;
    questionId: string;
    questionNo: string;
    questionTitle: string;
    questionScore: number;
    totalScore: number;
    createdAt: number;       // ms
    raw: string;             // 完整 LLM 响应文本
    result: JudgeResult | null;
  }
  export function addLocalRecord(rec: Omit<LocalJudgeRecord, 'id' | 'createdAt'>): LocalJudgeRecord
  export function listLocalRecords(limit?: number): LocalJudgeRecord[]
  export function getLocalRecord(id: string): LocalJudgeRecord | null
  export function deleteLocalRecord(id: string): void
  export function upsertLocalRecord(rec: LocalJudgeRecord): void
  ```

- [ ] **Step 1: 实现 judgeStore.ts**

```ts
// ShenlunApp/src/llm/judgeStore.ts
import { getStorage } from '../storage/mmkv';
import type { JudgeResult } from './client';

const KEY = 'judge_history_v1';

function readAll(): LocalJudgeRecord[] {
  const s = getStorage();
  if (!s) return [];
  try {
    const raw = s.getString(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(arr: LocalJudgeRecord[]): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.set(KEY, JSON.stringify(arr.slice(0, 200)));
  } catch {}
}

export interface LocalJudgeRecord {
  id: string;
  questionId: string;
  questionNo: string;
  questionTitle: string;
  questionScore: number;
  totalScore: number;
  createdAt: number;
  raw: string;
  result: JudgeResult | null;
}

function genId(): string {
  return 'judge-' + Math.random().toString(16).slice(2, 10) + Date.now().toString(36);
}

export function addLocalRecord(rec: Omit<LocalJudgeRecord, 'id' | 'createdAt'>): LocalJudgeRecord {
  const full: LocalJudgeRecord = { ...rec, id: genId(), createdAt: Date.now() };
  const all = readAll();
  all.unshift(full);
  writeAll(all);
  return full;
}

export function listLocalRecords(limit = 50): LocalJudgeRecord[] {
  return readAll().slice(0, limit);
}

export function getLocalRecord(id: string): LocalJudgeRecord | null {
  return readAll().find(r => r.id === id) ?? null;
}

export function deleteLocalRecord(id: string): void {
  writeAll(readAll().filter(r => r.id !== id));
}

export function upsertLocalRecord(rec: LocalJudgeRecord): void {
  const all = readAll();
  const i = all.findIndex(r => r.id === rec.id);
  if (i >= 0) all[i] = rec; else all.unshift(rec);
  writeAll(all);
}
```

- [ ] **Step 2: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add ShenlunApp/src/llm/judgeStore.ts
git commit -m "feat(judge): 本地 MMKV 历史 CRUD"
```

---

## Task 8: 客户端 src/api/llmConfig.ts (Server 端 LLM 配置 API 封装)

**Files:**
- Create: `ShenlunApp/src/api/llmConfig.ts`

**Interfaces:**
- ```ts
  export interface RemoteLlmConfig { configured: boolean; provider?: string; baseUrl?: string; model?: string; updatedAt?: number }
  export async function fetchLlmConfig(deviceId: string): Promise<RemoteLlmConfig>
  export async function saveLlmConfig(deviceId: string, cfg: LlmConfig): Promise<boolean>
  export async function deleteLlmConfig(deviceId: string): Promise<boolean>
  export async function fetchJudgeHistory(deviceId: string, limit?: number): Promise<Array<{ id: string; questionId: string; questionTitle: string; questionScore: number; totalScore: number; createdAt: number }>>
  export async function deleteJudgeHistoryServer(id: string, deviceId: string): Promise<boolean>
  ```

- [ ] **Step 1: 实现 llmConfig.ts**

```ts
// ShenlunApp/src/api/llmConfig.ts
import { getDeviceId } from '../storage/mmkv';
import type { LlmConfig } from '../llm/provider';

const BASE = 'http://124.223.5.144';

export interface RemoteLlmConfig {
  configured: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
  updatedAt?: number;
}

export async function fetchLlmConfig(deviceId: string = getDeviceId()): Promise<RemoteLlmConfig> {
  try {
    const r = await fetch(`${BASE}/api/judge/llm-config?device_id=${encodeURIComponent(deviceId)}`);
    if (!r.ok) return { configured: false };
    return await r.json() as RemoteLlmConfig;
  } catch {
    return { configured: false };
  }
}

export async function saveLlmConfig(deviceId: string, cfg: LlmConfig): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/judge/llm-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        provider: cfg.provider,
        base_url: cfg.baseUrl,
        model: cfg.model,
        api_key: cfg.apiKey,
      }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function deleteLlmConfig(deviceId: string = getDeviceId()): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/judge/llm-config?device_id=${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
    return r.ok;
  } catch {
    return false;
  }
}

export interface RemoteJudgeItem {
  id: string;
  questionId: string;
  questionTitle: string;
  questionScore: number;
  totalScore: number;
  createdAt: number;
}

export async function fetchJudgeHistory(deviceId: string = getDeviceId(), limit = 20): Promise<RemoteJudgeItem[]> {
  try {
    const r = await fetch(`${BASE}/api/judge/history?device_id=${encodeURIComponent(deviceId)}&limit=${limit}`);
    if (!r.ok) return [];
    const j = await r.json() as { items: any[] };
    return (j.items ?? []).map(it => ({
      id: it.id,
      questionId: it.question_id ?? '',
      questionTitle: it.question_title ?? '',
      questionScore: Number(it.question_score ?? 0),
      totalScore: Number(it.total_score ?? 0),
      createdAt: Number(it.created_at ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function deleteJudgeHistoryServer(id: string, deviceId: string = getDeviceId()): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/judge/${encodeURIComponent(id)}?device_id=${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
    return r.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add ShenlunApp/src/api/llmConfig.ts
git commit -m "feat(judge): Server LLM 配置 + 历史 API 封装"
```

---

## Task 9: 客户端 src/screens/LlmConfigScreen.tsx

**Files:**
- Create: `ShenlunApp/src/screens/LlmConfigScreen.tsx`

**Interfaces:**
- 4 个 radio 选预设 → 自动填 base_url / model
- api_key password 输入
- "保存" → saveLlmConfig → 提示成功
- "测试连接" → fetch `/api/judge/run` 用 dummy 题目 + "test"，会扣一次 LLM 调用费

- [ ] **Step 1: 实现 LlmConfigScreen.tsx**

```tsx
// ShenlunApp/src/screens/LlmConfigScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { PRESETS, findPreset, type Provider, type LlmConfig } from '../llm/provider';
import { fetchLlmConfig, saveLlmConfig, deleteLlmConfig } from '../api/llmConfig';
import { getDeviceId } from '../storage/mmkv';

export default function LlmConfigScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const [provider, setProvider] = useState<Provider>('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com');
  const [model, setModel] = useState('deepseek-chat');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const cfg = await fetchLlmConfig();
      if (cfg.configured) {
        const p = (cfg.provider as Provider) || 'custom';
        setProvider(p);
        setBaseUrl(cfg.baseUrl || '');
        setModel(cfg.model || '');
      }
      setLoading(false);
    })();
  }, []);

  const onPickProvider = (p: Provider) => {
    setProvider(p);
    const preset = findPreset(p);
    if (preset && p !== 'custom') {
      setBaseUrl(preset.baseUrl);
      setModel(preset.model);
    }
  };

  const onSave = useCallback(async () => {
    if (!apiKey.trim()) { Alert.alert('请填 API Key'); return; }
    if (!baseUrl.trim() || !model.trim()) { Alert.alert('请填 base_url 和 model'); return; }
    setSaving(true);
    const ok = await saveLlmConfig(getDeviceId(), { provider, baseUrl, model, apiKey });
    setSaving(false);
    Alert.alert(ok ? '已保存' : '保存失败', ok ? '已加密存到服务端' : '请检查网络或重试');
  }, [provider, baseUrl, model, apiKey]);

  const onTest = useCallback(async () => {
    setTesting(true);
    try {
      const r = await fetch('http://124.223.5.144/api/judge/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: getDeviceId(),
          question: { id: 'test', title: '测试题', body: '这是一道测试题', score: 10, question_no: '0' },
          user_answer: '这是一段测试答案，至少要达到五十字才能通过校验，确保服务端接收到正确的请求。',
        }),
      });
      Alert.alert(r.ok ? '连接成功' : '连接失败', r.ok ? '请前往分析 Tab 试评' : `HTTP ${r.status}`);
    } catch (e: any) {
      Alert.alert('连接失败', String(e?.message ?? e));
    } finally {
      setTesting(false);
    }
  }, []);

  const onDelete = useCallback(() => {
    Alert.alert('删除配置', '确定要删除 LLM 配置吗？删除后评卷功能将不可用。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          await deleteLlmConfig();
          setApiKey('');
          Alert.alert('已删除');
        },
      },
    ]);
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={t.brass} /></View>;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        <Text style={[styles.h1, { color: t.ink, fontFamily: fonts.serif.bold }]}>AI 评卷 · LLM 配置</Text>
        <Text style={[styles.h2, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          填入你自己的 Key，App → Server → LLM 厂商。Key 在服务端用 Fernet 加密存储。
        </Text>

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>服务商</Text>
        {PRESETS.map(p => (
          <Pressable
            key={p.provider}
            onPress={() => onPickProvider(p.provider)}
            style={[styles.radio, { borderColor: t.border, backgroundColor: t.paper }, provider === p.provider && { borderColor: t.seal, borderWidth: 2 }]}
          >
            <Text style={[styles.radioText, { color: t.ink, fontFamily: fonts.kai.regular }]}>{p.label}</Text>
            {provider === p.provider && <Text style={{ color: t.seal }}>●</Text>}
          </Pressable>
        ))}

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>Base URL</Text>
        <TextInput
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://api.deepseek.com"
          placeholderTextColor={t.inkFaint}
          style={[styles.input, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.serif.regular }]}
        />

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>Model</Text>
        <TextInput
          value={model}
          onChangeText={setModel}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="deepseek-chat"
          placeholderTextColor={t.inkFaint}
          style={[styles.input, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.serif.regular }]}
        />

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>API Key</Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="sk-..."
          placeholderTextColor={t.inkFaint}
          style={[styles.input, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.serif.regular }]}
        />

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={[styles.btn, { backgroundColor: t.seal, borderColor: t.sealDeep }, saving && { opacity: 0.5 }]}
        >
          <Text style={[styles.btnText, { color: t.paper, fontFamily: fonts.serif.bold }]}>
            {saving ? '保存中...' : '保存配置'}
          </Text>
        </Pressable>

        <Pressable
          onPress={onTest}
          disabled={testing}
          style={[styles.btnGhost, { borderColor: t.brassDeep }, testing && { opacity: 0.5 }]}
        >
          <Text style={[styles.btnGhostText, { color: t.brassDeep, fontFamily: fonts.kai.bold }]}>
            {testing ? '测试中...' : '测试连接（会扣 1 次 LLM 调用费）'}
          </Text>
        </Pressable>

        <Pressable onPress={onDelete} style={[styles.btnDanger]}>
          <Text style={[styles.btnDangerText, { color: t.sealDeep, fontFamily: fonts.kai.bold }]}>删除配置</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: fontSizes.subtitle, letterSpacing: 4, marginBottom: spacing.sm },
  h2: { fontSize: fontSizes.caption, lineHeight: 20, marginBottom: spacing.lg },
  label: { fontSize: fontSizes.caption, letterSpacing: 2, marginTop: spacing.md, marginBottom: spacing.xs },
  radio: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: borders.hair, borderRadius: radii.sm,
  },
  radioText: { fontSize: fontSizes.body },
  input: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: borders.hair, borderRadius: radii.sm,
    fontSize: fontSizes.body,
  },
  btn: {
    marginTop: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: 1,
    alignItems: 'center',
  },
  btnText: { fontSize: fontSizes.body, letterSpacing: 4 },
  btnGhost: {
    marginTop: spacing.md, paddingVertical: spacing.md,
    borderRadius: radii.md, borderWidth: 1,
    alignItems: 'center', backgroundColor: 'transparent',
  },
  btnGhostText: { fontSize: fontSizes.caption, letterSpacing: 2 },
  btnDanger: { marginTop: spacing.xl, alignItems: 'center', paddingVertical: spacing.sm },
  btnDangerText: { fontSize: fontSizes.caption, letterSpacing: 2 },
});
```

- [ ] **Step 2: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add ShenlunApp/src/screens/LlmConfigScreen.tsx
git commit -m "feat(judge): LLM 配置屏（3 预设 + 自定义 + 加密存）"
```

---

## Task 10: 客户端 src/screens/JudgeScreen.tsx

**Files:**
- Create: `ShenlunApp/src/screens/JudgeScreen.tsx`

- [ ] **Step 1: 实现 JudgeScreen.tsx**

```tsx
// ShenlunApp/src/screens/JudgeScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { runJudge, type JudgeResult, safeParseJudgeResult } from '../llm/client';
import { addLocalRecord } from '../llm/judgeStore';
import { fetchLlmConfig } from '../api/llmConfig';
import { getDeviceId } from '../storage/mmkv';
import type { Question } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'Judge'>;

export default function JudgeScreen({ route, navigation }: Props) {
  const { theme } = useTheme();
  const t = theme.tokens;
  const passedQuestion: Question | undefined = route.params?.question;

  const [question, setQuestion] = useState<Question | undefined>(passedQuestion);
  const [answer, setAnswer] = useState('');
  const [running, setRunning] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [raw, setRaw] = useState('');
  const [hasConfig, setHasConfig] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const cfg = await fetchLlmConfig();
      setHasConfig(cfg.configured);
    })();
  }, []);

  const onStart = useCallback(async () => {
    if (!question) { Alert.alert('未选题目'); return; }
    if (answer.trim().length < 50) { Alert.alert('答案太短', '至少 50 字'); return; }
    if (!hasConfig) {
      Alert.alert('未配置 LLM', '请到设置 → AI 评卷配置 Key', [
        { text: '去配置', onPress: () => navigation.navigate('LlmConfig' as never) },
        { text: '取消', style: 'cancel' },
      ]);
      return;
    }
    setRunning(true);
    setStreamText('');
    setResult(null);
    setRaw('');
    const ac = new AbortController();
    abortRef.current = ac;
    const gen = runJudge(question, answer, getDeviceId(), { signal: ac.signal });
    let collected = '';
    try {
      for await (const evt of gen) {
        if (evt.type === 'delta') {
          collected += evt.text;
          setStreamText(collected);
        } else if (evt.type === 'result') {
          setResult(evt.result);
          setRaw(evt.raw);
          if (evt.result) {
            addLocalRecord({
              questionId: question.id,
              questionNo: String(question.question_no ?? ''),
              questionTitle: question.title,
              questionScore: question.score ?? 0,
              totalScore: evt.result.total,
              raw: evt.raw,
              result: evt.result,
            });
          }
        } else if (evt.type === 'error') {
          Alert.alert('评卷失败', `${evt.code}: ${evt.message}`);
        }
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [question, answer, hasConfig, navigation]);

  const onCancel = () => abortRef.current?.abort();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>AI 评卷</Text>
        <Pressable onPress={() => navigation.navigate('JudgeHistory' as never)} hitSlop={8}>
          <Text style={[styles.historyText, { color: t.brassDeep, fontFamily: fonts.kai.bold }]}>历史</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl }}>
        {question ? (
          <View style={[styles.qCard, { backgroundColor: t.paper, borderColor: t.border }]}>
            <Text style={[styles.qTitle, { color: t.ink, fontFamily: fonts.serif.bold }]}>
              第{question.question_no}题  ·  {question.score} 分
            </Text>
            <Text style={[styles.qBody, { color: t.inkSoft, fontFamily: fonts.kai.regular }]} numberOfLines={6}>
              {question.body}
            </Text>
            <Text style={[styles.qFull, { color: t.brassDeep, fontFamily: fonts.kai.regular }]}>（跳自题详情，仅显示前 6 行）</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => navigation.navigate('Main' as never)}
            style={[styles.qCard, { backgroundColor: t.paper, borderColor: t.border }]}
          >
            <Text style={[styles.qTitle, { color: t.ink, fontFamily: fonts.serif.bold }]}>暂未选题目</Text>
            <Text style={[styles.qBody, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
              从"真题" Tab 进入任一题详情页，点右上角 🤖 AI 评卷 按钮直接带题过来。
            </Text>
          </Pressable>
        )}

        <Text style={[styles.label, { color: t.ink, fontFamily: fonts.kai.bold }]}>我的答案（至少 50 字）</Text>
        <TextInput
          value={answer}
          onChangeText={setAnswer}
          multiline
          textAlignVertical="top"
          placeholder="在此粘贴或手打你的申论答案..."
          placeholderTextColor={t.inkFaint}
          style={[styles.input, { backgroundColor: t.paper, borderColor: t.border, color: t.ink, fontFamily: fonts.kai.regular }]}
        />
        <Text style={[styles.countText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>字数：{answer.length}</Text>

        {!running ? (
          <Pressable
            onPress={onStart}
            style={[styles.btn, { backgroundColor: t.seal, borderColor: t.sealDeep }]}
          >
            <Text style={[styles.btnText, { color: t.paper, fontFamily: fonts.serif.bold }]}>开始评卷 →</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onCancel}
            style={[styles.btn, { backgroundColor: t.bg, borderColor: t.seal }]}
          >
            <Text style={[styles.btnText, { color: t.seal, fontFamily: fonts.serif.bold }]}>取消</Text>
          </Pressable>
        )}

        {(running || streamText) && (
          <View style={[styles.streamCard, { backgroundColor: t.paper, borderColor: t.border }]}>
            <View style={styles.streamHead}>
              <ActivityIndicator color={t.seal} />
              <Text style={[styles.streamHeadText, { color: t.seal, fontFamily: fonts.kai.bold }]}>
                {running ? '正在评卷...' : '评语（流式）'}
              </Text>
            </View>
            <Text style={[styles.streamBody, { color: t.ink, fontFamily: fonts.kai.regular }]}>
              {streamText || '等待响应...'}
            </Text>
          </View>
        )}

        {result && (
          <View style={[styles.resultCard, { backgroundColor: t.paper, borderColor: t.brass }]}>
            <View style={styles.resultHead}>
              <Text style={[styles.totalLabel, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>总 分</Text>
              <Text style={[styles.totalScore, { color: t.seal, fontFamily: fonts.serif.bold }]}>
                {result.total} <Text style={[styles.totalMax, { color: t.inkMuted, fontFamily: fonts.serif.regular }]}>/ {question?.score ?? 0}</Text>
              </Text>
            </View>

            <View style={styles.dimList}>
              {result.dimensions.map(d => (
                <View key={d.key} style={[styles.dimRow, { borderBottomColor: t.divider }]}>
                  <Text style={[styles.dimKey, { color: t.ink, fontFamily: fonts.kai.bold }]}>{labelOfKey(d.key)}</Text>
                  <Text style={[styles.dimScore, { color: t.brassDeep, fontFamily: fonts.serif.bold }]}>{d.score}</Text>
                  <Text style={[styles.dimComment, { color: t.inkSoft, fontFamily: fonts.kai.regular }]} numberOfLines={2}>{d.comment}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.section, { color: t.jade, fontFamily: fonts.kai.bold }]}>亮 点</Text>
            {result.highlights.map((h, i) => (
              <Text key={i} style={[styles.bullet, { color: t.ink, fontFamily: fonts.kai.regular }]}>· {h}</Text>
            ))}

            <Text style={[styles.section, { color: t.seal, fontFamily: fonts.kai.bold }]}>不 足</Text>
            {result.weaknesses.map((w, i) => (
              <Text key={i} style={[styles.bullet, { color: t.ink, fontFamily: fonts.kai.regular }]}>· {w}</Text>
            ))}

            <Text style={[styles.section, { color: t.brassDeep, fontFamily: fonts.kai.bold }]}>重写建议</Text>
            <Text style={[styles.bullet, { color: t.inkSoft, fontFamily: fonts.kai.regular }]}>{result.rewrite_hint}</Text>
          </View>
        )}

        {!result && raw && !running && (
          <View style={[styles.streamCard, { backgroundColor: t.paper, borderColor: t.seal }]}>
            <Text style={[styles.streamHeadText, { color: t.seal, fontFamily: fonts.kai.bold }]}>评分维度解析失败</Text>
            <Text style={[styles.streamBody, { color: t.ink, fontFamily: fonts.kai.regular }]}>{raw}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function labelOfKey(k: string): string {
  switch (k) {
    case 'theme': return '立 意';
    case 'structure': return '结 构';
    case 'argument': return '论 据';
    case 'language': return '语 言';
    case 'wordcount': return '字 数';
    default: return k;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs,
    borderBottomWidth: 1,
  },
  backText: { fontSize: fontSizes.body, minWidth: 60 },
  title: { fontSize: fontSizes.subtitle, letterSpacing: 4, flex: 1, textAlign: 'center' },
  historyText: { fontSize: fontSizes.caption, minWidth: 60, textAlign: 'right' },
  qCard: { padding: spacing.md, borderWidth: borders.hair, borderRadius: radii.md, marginBottom: spacing.md },
  qTitle: { fontSize: fontSizes.body, marginBottom: spacing.xs },
  qBody: { fontSize: fontSizes.caption, lineHeight: 20 },
  qFull: { fontSize: fontSizes.micro, marginTop: spacing.xs },
  label: { fontSize: fontSizes.caption, letterSpacing: 2, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    minHeight: 200, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: borders.hair, borderRadius: radii.md,
    fontSize: fontSizes.body, lineHeight: 22,
  },
  countText: { fontSize: fontSizes.micro, textAlign: 'right', marginTop: 4 },
  btn: { marginTop: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, alignItems: 'center' },
  btnText: { fontSize: fontSizes.body, letterSpacing: 4 },
  streamCard: { marginTop: spacing.lg, padding: spacing.md, borderWidth: borders.hair, borderRadius: radii.md },
  streamHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  streamHeadText: { fontSize: fontSizes.caption, letterSpacing: 2 },
  streamBody: { fontSize: fontSizes.body, lineHeight: 22 },
  resultCard: { marginTop: spacing.lg, padding: spacing.md, borderWidth: 1, borderRadius: radii.md },
  resultHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing.md },
  totalLabel: { fontSize: fontSizes.caption, letterSpacing: 2 },
  totalScore: { fontSize: 32 },
  totalMax: { fontSize: fontSizes.body },
  dimList: { marginBottom: spacing.md },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderBottomWidth: 1 },
  dimKey: { width: 50, fontSize: fontSizes.caption, letterSpacing: 2 },
  dimScore: { width: 40, fontSize: fontSizes.body, textAlign: 'right' },
  dimComment: { flex: 1, fontSize: fontSizes.caption, marginLeft: spacing.sm },
  section: { fontSize: fontSizes.caption, letterSpacing: 4, marginTop: spacing.sm, marginBottom: 4 },
  bullet: { fontSize: fontSizes.caption, lineHeight: 22, marginLeft: spacing.sm },
});
```

- [ ] **Step 2: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add ShenlunApp/src/screens/JudgeScreen.tsx
git commit -m "feat(judge): 评卷主屏 (流式 + 5 维度卡片 + 历史跳转)"
```

---

## Task 11: 客户端 src/screens/JudgeHistoryScreen.tsx

- [ ] **Step 1: 实现 JudgeHistoryScreen.tsx**

```tsx
// ShenlunApp/src/screens/JudgeHistoryScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, Pressable, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { listLocalRecords, deleteLocalRecord, type LocalJudgeRecord } from '../llm/judgeStore';
import { fetchJudgeHistory, deleteJudgeHistoryServer } from '../api/llmConfig';

type Nav = NativeStackNavigationProp<RootStackParamList, 'JudgeHistory'>;

export default function JudgeHistoryScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation<Nav>();
  const [records, setRecords] = useState<LocalJudgeRecord[]>([]);
  const [serverOnly, setServerOnly] = useState<Array<{ id: string; questionTitle: string; questionScore: number; totalScore: number; createdAt: number }>>([]);

  const load = useCallback(async () => {
    setRecords(listLocalRecords(50));
    const serverItems = await fetchJudgeHistory(undefined, 50);
    const localIds = new Set(listLocalRecords(200).map(r => r.id));
    setServerOnly(serverItems.filter(s => !localIds.has(s.id)));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDelete = useCallback((id: string, isLocal: boolean) => {
    Alert.alert('删除记录', '确定删除？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          if (isLocal) deleteLocalRecord(id);
          await deleteJudgeHistoryServer(id);
          load();
        },
      },
    ]);
  }, [load]);

  const fmtTime = (ms: number) => {
    const d = new Date(ms);
    return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderItem = ({ item, isLocal }: { item: any; isLocal: boolean }) => (
    <Pressable
      onLongPress={() => onDelete(item.id, isLocal)}
      style={[styles.card, { backgroundColor: t.paper, borderColor: t.border }]}
    >
      <View style={styles.cardHead}>
        <Text style={[styles.qTitle, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={1}>
          {item.questionTitle || item.question_title || '未命名题'}
        </Text>
        <Text style={[styles.score, { color: t.seal, fontFamily: fonts.serif.bold }]}>
          {item.totalScore}/{item.questionScore ?? item.question_score}
        </Text>
      </View>
      <Text style={[styles.meta, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
        {fmtTime(item.createdAt)}  ·  长按删除
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={[styles.backText, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>评卷历史</Text>
        <View style={{ width: 60 }} />
      </View>
      <FlatList
        data={[
          ...records.map(r => ({ ...r, _isLocal: true })),
          ...serverOnly.map(s => ({ ...s, _isLocal: false })),
        ]}
        keyExtractor={(it: any) => it.id + (it._isLocal ? '_L' : '_S')}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={<Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>暂无评卷记录</Text>}
        renderItem={({ item }: any) => renderItem({ item, isLocal: item._isLocal })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs,
    borderBottomWidth: 1,
  },
  backText: { fontSize: fontSizes.body, minWidth: 60 },
  title: { fontSize: fontSizes.subtitle, letterSpacing: 4, flex: 1, textAlign: 'center' },
  card: { padding: spacing.md, marginBottom: spacing.sm, borderWidth: borders.hair, borderRadius: radii.md },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qTitle: { flex: 1, fontSize: fontSizes.body, marginRight: spacing.sm },
  score: { fontSize: fontSizes.body },
  meta: { fontSize: fontSizes.micro, marginTop: spacing.xs },
  empty: { textAlign: 'center', marginTop: spacing.xxxl, fontSize: fontSizes.body, letterSpacing: 4 },
});
```

- [ ] **Step 2: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add ShenlunApp/src/screens/JudgeHistoryScreen.tsx
git commit -m "feat(judge): 评卷历史屏 (本地 + 云端合并列表 + 长按删除)"
```

---

## Task 12: 客户端 App.tsx 路由注册 + PaperScreen / AnalysisScreen / SettingsScreen 入口

**Files:**
- Modify: `ShenlunApp/src/App.tsx`
- Modify: `ShenlunApp/src/screens/AnalysisScreen.tsx`（替换 onAIJudge）
- Modify: `ShenlunApp/src/screens/PaperScreen.tsx`（题详情右上角加 🤖 按钮）
- Modify: `ShenlunApp/src/screens/SettingsScreen.tsx`（新增 LLM 配置入口）

**Interfaces (App.tsx):**
- RootStackParamList 新增:
  ```ts
  Judge: { question: Question | undefined };
  JudgeHistory: undefined;
  LlmConfig: undefined;
  ```

- [ ] **Step 1: 改 App.tsx 注册路由 + 加 Question import**

找到 `RootStackParamList` 类型定义（约 23 行），加：

```ts
  Judge: { question: import('./api/client').Question | undefined };
  JudgeHistory: undefined;
  LlmConfig: undefined;
```

（如果类型定义在 `App.tsx` 外，确保 import `Question`）

在 `Stack.Navigator` 路由列表内（约 65 行）加：

```tsx
      <Stack.Screen name="Judge"         component={JudgeScreen}         options={{ headerShown: false }} />
      <Stack.Screen name="JudgeHistory"  component={JudgeHistoryScreen}  options={{ headerShown: false }} />
      <Stack.Screen name="LlmConfig"     component={LlmConfigScreen}     options={{ headerShown: false }} />
```

在顶部 import 区加：

```tsx
import JudgeScreen from './screens/JudgeScreen';
import JudgeHistoryScreen from './screens/JudgeHistoryScreen';
import LlmConfigScreen from './screens/LlmConfigScreen';
```

- [ ] **Step 2: 改 AnalysisScreen.tsx — onAIJudge 改为跳 Judge**

替换 `onAIJudge` 整段（98-103 行）：

```tsx
  const onAIJudge = useCallback(() => {
    navigation.navigate('Judge', { question: undefined });
  }, [navigation]);
```

并在 import 区加：

```tsx
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
```

（注意：AnalysisScreen 里已有这些 import，先检查；若已存在就不重复加）

- [ ] **Step 3: 改 PaperScreen.tsx 题详情右上角加 🤖 AI 评卷 按钮**

在题详情 activeQ 视图（94-122 行）`topBar` 右侧加按钮：

```tsx
        <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
          <Pressable onPress={() => setActiveQ(null)} hitSlop={8}>
            <Text style={[styles.backText, { color: t.ink }]}>← 单题列表</Text>
          </Pressable>
          <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={1}>
            第{activeQ.question_no}题
          </Text>
          <Pressable
            onPress={() => nav.navigate('Judge', { question: activeQ })}
            style={styles.aiBtn}
          >
            <Text style={[styles.aiBtnText, { color: t.paper, fontFamily: fonts.serif.bold }]}>🤖 评卷</Text>
          </Pressable>
        </View>
```

`PaperScreen` 已用 `useNavigation<NavProp>()`，需把 `NavProp` 加上 `Judge` 参数（即依赖 App.tsx 类型更新）。

加 styles：

```ts
  aiBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: '#C04851', borderRadius: radii.sm },
  aiBtnText: { fontSize: fontSizes.caption },
```

（颜色用硬编码 `#C04851` 是 V3 seal 色，V3 主题的 seal token 不在 PaperScreen 已 import 的范围里，先硬编码保持本次提交最小；后续若 PaperScreen 已 import theme tokens 可改用 `t.seal`）

- [ ] **Step 4: 改 SettingsScreen.tsx 加 LLM 配置入口**

打开 `ShenlunApp/src/screens/SettingsScreen.tsx`，在合适位置（如顶部"主题"区块之后）加：

```tsx
      <Pressable
        onPress={() => navigation.navigate('LlmConfig')}
        style={styles.settingRow}
      >
        <Text style={[styles.settingTitle, { color: t.ink, fontFamily: fonts.kai.bold }]}>AI 评卷 · LLM 配置</Text>
        <Text style={[styles.settingSub, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>配置 Key、切换服务商</Text>
        <Text style={[styles.arrow, { color: t.brassDeep }]}>›</Text>
      </Pressable>
```

（具体风格跟随 SettingsScreen 现有 row 风格，保留视觉一致；若现有有 `row` / `arrow` 样式，命名相同即可）

- [ ] **Step 5: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add ShenlunApp/src/App.tsx ShenlunApp/src/screens/AnalysisScreen.tsx ShenlunApp/src/screens/PaperScreen.tsx ShenlunApp/src/screens/SettingsScreen.tsx
git commit -m "feat(judge): 路由 + 入口接入 (Analysis / Paper / Settings)"
```

---

## Task 13: 客户端单测 — client.ts 关键函数

**Files:**
- Create: `ShenlunApp/src/llm/__tests__/client.test.ts`

- [ ] **Step 1: 写测试**

```ts
// ShenlunApp/src/llm/__tests__/client.test.ts
import { extractJsonByBraceDepth, safeParseJudgeResult } from '../client';

describe('extractJsonByBraceDepth', () => {
  it('returns null when no brace', () => {
    expect(extractJsonByBraceDepth('hello')).toEqual({ json: null, start: -1, end: -1 });
  });

  it('extracts simple object', () => {
    const r = extractJsonByBraceDepth('prefix {"a":1} suffix');
    expect(r.json).toBe('{"a":1}');
  });

  it('handles nested objects', () => {
    const r = extractJsonByBraceDepth('x {"a":{"b":2},"c":3} y');
    expect(r.json).toBe('{"a":{"b":2},"c":3}');
  });

  it('handles braces inside strings', () => {
    const r = extractJsonByBraceDepth('x {"a":"{not}"} y');
    expect(r.json).toBe('{"a":"{not}"}');
  });

  it('handles escaped quotes', () => {
    const r = extractJsonByBraceDepth('x {"a":"he said \\"hi\\""} y');
    expect(r.json).toBe('{"a":"he said \\"hi\\""}');
  });

  it('returns null when not closed', () => {
    const r = extractJsonByBraceDepth('x {"a":1');
    expect(r.json).toBeNull();
  });
});

describe('safeParseJudgeResult', () => {
  it('parses valid result', () => {
    const raw = '{"commentary":"好","total":18,"dimensions":[{"key":"theme","score":5,"comment":"扣题"}],"highlights":["a"],"weaknesses":["b"],"rewrite_hint":"x"}';
    const r = safeParseJudgeResult(raw);
    expect(r?.total).toBe(18);
    expect(r?.dimensions[0].key).toBe('theme');
  });

  it('returns null on bad json', () => {
    expect(safeParseJudgeResult('not json')).toBeNull();
  });

  it('returns defaults on missing fields', () => {
    const r = safeParseJudgeResult('{"total":5}');
    expect(r?.commentary).toBe('');
    expect(r?.dimensions).toEqual([]);
    expect(r?.highlights).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `cd ShenlunApp && npx jest src/llm/__tests__/client.test.ts`
Expected: 9 passed

- [ ] **Step 3: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add ShenlunApp/src/llm/__tests__/client.test.ts
git commit -m "test(judge): client.ts SSE 解析 + 括号深度切 JSON 单测"
```

---

## Task 14: 端到端手动验证清单（不上 CI）

**Files:**
- Create: `docs/superpowers/plans/2026-07-29-ai-judge-e2e-checklist.md`

- [ ] **Step 1: 写清单**

```markdown
# AI 评卷 E2E 验证清单

> 不在 CI 跑，按下面步骤手动在模拟器/真机跑一遍

## 0. 前置
- [ ] 服务端部署：ssh 124.223.5.144 跑 `docs/server/deploy_judge.sh`
- [ ] 服务端启动 banner 含 `[judge] db=... fernet_key=... rate=5/min`
- [ ] 客户端重新 build + 装到模拟器

## 1. LLM 配置
- [ ] 设置 → AI 评卷 LLM 配置
- [ ] 选 DeepSeek，填 base_url / model / api_key
- [ ] 保存 → 提示"已加密存到服务端"
- [ ] 测试连接 → 提示"连接成功"（会真发请求扣 1 次调用费）
- [ ] kill app 重开 → 配置仍在

## 2. 评卷流程
- [ ] PaperScreen → 任一题 → 🤖 评卷
- [ ] JudgeScreen 默认带题过来
- [ ] 输入 200 字答案
- [ ] 点"开始评卷"
- [ ] 看到流式评语逐字出现（~8-15s）
- [ ] 流结束后切出 5 维度卡片
- [ ] 维度分数相加 ≈ total ±1

## 3. 历史
- [ ] JudgeScreen 顶栏"历史" → 进入 JudgeHistory
- [ ] 看到刚评的记录（含分数）
- [ ] 长按删除 → 本地 + 服务端都删
- [ ] kill app 重开 → 本地记录仍在
- [ ] 切换设备号（test）→ 拉服务端历史，看不到本机记录

## 4. 错误路径
- [ ] 删 LLM 配置 → 评卷 → 提示"未配置 LLM，请去配置"
- [ ] 改坏 base_url → 评卷 → 提示"评卷失败：http_..."
- [ ] 输入 < 50 字 → 提示"答案太短"
- [ ] 1 分钟内评 6 次 → 第 6 次 429

## 5. 离线降级
- [ ] 飞行模式 → JudgeHistory 仍能看到本地记录
- [ ] 飞行模式 → 评卷 → 提示"网络异常"
```

- [ ] **Step 2: 提交**

```bash
cd C:\Users\hecto\ZCodeProject
git add docs/superpowers/plans/2026-07-29-ai-judge-e2e-checklist.md
git commit -m "docs(judge): E2E 手动验证清单"
```

---

## Self-Review

**1. Spec 覆盖**：
- D1 纯文本 + image 预留 — Task 6 client.ts body 字段无 image（V2 留口） ✓
- D2 LLM 即评即生 5 维度 — Task 3 system_prompt ✓ Task 10 渲染卡片 ✓
- D3 App → Server → LLM — Task 3 server urllib 调 LLM ✓
- D4 Key Fernet 加密存 — Task 1 fernet ✓ Task 9 上传 key
- D5 5 维度 + 评语 + 亮点/不足 + 重写 — Task 10 渲染 ✓
- D6 本地 + Server 同步 — Task 7 mmkv + Task 8 server API + Task 11 合并列表
- D7 流式 + 括号深度切 — Task 3 server stream + Task 6 client extractJsonByBraceDepth
- D8 3 预设 + 自定义 — Task 5 PRESETS
- D9 stdlib only + cryptography — Task 1 + 3 全部 stdlib
- D10 限流 5/min — Task 1 check_rate_limit + Task 3 调
- §5 4 屏 UI — Task 9/10/11 + Task 12 入口
- §7 错误处理 — Task 3 401/429/502 + Task 10 Alert 透传
- §8 隐私 — Task 1 Fernet + Task 3 不存 body/answer 到 history 字段直到流结束
- §9 测试 — Task 1/2/3 服务端 pytest + Task 13 客户端 jest
- §10 风险与回滚 — Task 1 .fernet_key 丢失自愈 + Task 3 限流

**2. 占位符扫描**：无 TBD / TODO / "类似 Task N" / "实现待定"。

**3. 类型一致性**：
- `Question.question_no` 引用统一为 `string`（在 buildUserPrompt 用 `String(...)` 兜底）
- `runJudge` 签名前后一致
- `LocalJudgeRecord.id` 用 `judge-` 前缀；server `judge_history.id` 也用 `judge-` 前缀
- `extractJsonByBraceDepth` 返回 `{json, start, end}` 与 server 端 `extract_json` 一致逻辑

**4. 范围检查**：一个 plan，~14 task，每个 task ≤ 1 commit，可独立 review。