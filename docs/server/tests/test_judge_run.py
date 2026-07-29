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
            'user_answer': '这是用户答案' * 10,  # >= 50 chars for answer_too_short check
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
