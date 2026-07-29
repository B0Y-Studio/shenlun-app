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