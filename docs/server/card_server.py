#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HTTP 服务：手机访问 http://本机IP:8080
- 仅用 Python 标准库
- 支持今日3篇、已读标记、金句收藏、笔记
"""
import os
import re
import json
import sqlite3
import socket
import threading
import hashlib
import time
import pickle
from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta
from collections import Counter

# === 路径配置 (跨平台) ===
# 通过环境变量或默认值设置 OUT_DIR
DEFAULT_LOCAL = r"E:\申论知识库\09_选卡阅读"
DEFAULT_SERVER = "/opt/xuexi/09_选卡阅读"
OUT_DIR = os.environ.get("XUEXI_DIR") or (DEFAULT_SERVER if os.path.exists(DEFAULT_SERVER) else DEFAULT_LOCAL)
SHIPING_DIR = os.path.join(OUT_DIR, "时评")
DB_PATH = os.path.join(OUT_DIR, "_cards.db")
CONFIG_PATH = os.path.join(OUT_DIR, "config.json")
STATIC_DIR = os.path.join(OUT_DIR, "_static")
RECORDS_DIR = os.path.join(OUT_DIR, "_records")
HIGHLIGHTS_DIR = os.path.join(OUT_DIR, "_highlights")

os.makedirs(RECORDS_DIR, exist_ok=True)
os.makedirs(HIGHLIGHTS_DIR, exist_ok=True)

# 锁：防止多请求同时修改 DB
db_lock = threading.Lock()

def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def normalize_title(title):
    return re.sub(r'[^\u4e00-\u9fa5\u0030-\u0039\u0041-\u005a\u0061-\u007a]+', '', title)

def load_config():
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

# === API 处理 ===
class CardHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # 简化日志
        return

    def _send(self, status, body, content_type='text/html; charset=utf-8'):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/' or path == '/index.html':
            self._send(200, load_index())
        elif path == '/api/today':
            self._send(200, get_today_cards(), 'application/json')
        elif path == '/api/card':
            qs = parse_qs(urlparse(self.path).query)
            self._send(200, get_card_body(qs.get('norm', [''])[0]), 'application/json')
        elif path == '/api/stats':
            self._send(200, get_stats(), 'application/json')
        elif path == '/api/history':
            self._send(200, get_history(), 'application/json')
        elif path == '/api/highlights':
            self._send(200, get_highlights(), 'application/json')
        elif path == '/api/articles':
            qs = parse_qs(urlparse(self.path).query)
            self._send(200, list_articles(qs), 'application/json')
        else:
            self._send(404, 'Not Found')

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get('Content-Length', 0))
        raw_bytes = self.rfile.read(length) if length else b''
        # 兼容多种 Content-Type：application/json / application/x-www-form-urlencoded / 文本
        ctype = (self.headers.get('Content-Type') or '').lower()
        try:
            if 'application/json' in ctype:
                data = json.loads(raw_bytes.decode('utf-8')) if raw_bytes else {}
            elif 'application/x-www-form-urlencoded' in ctype:
                from urllib.parse import parse_qs as _pq
                data = {k: v[0] for k, v in _pq(raw_bytes.decode('utf-8', errors='replace')).items()}
            else:
                # 默认按 utf-8 文本尝试
                try:
                    data = json.loads(raw_bytes.decode('utf-8'))
                except Exception:
                    data = {'_raw': raw_bytes.decode('utf-8', errors='replace')}
        except Exception:
            data = {}
        print(f"[POST] path={path} ctype={ctype} data_keys={list(data.keys())}", file=__import__('sys').stderr)

        # POST /api/articles 走 list_articles
        if path == '/api/articles':
            qs = {k: [v] for k, v in data.items()}
            self._send(200, list_articles(qs), 'application/json')
            return

        # 其余 POST 走原逻辑
        if path == '/api/mark-read':
            self._send(200, mark_read(data), 'application/json')
        elif path == '/api/highlight':
            self._send(200, save_highlight(data), 'application/json')
        elif path == '/api/note':
            self._send(200, save_note(data), 'application/json')
        elif path == '/api/skip':
            self._send(200, skip_card(data), 'application/json')
        else:
            self._send(404, 'Not Found')


# === 选卡逻辑 ===
CACHE_PATH = os.path.join(OUT_DIR, "_article_cache.pkl")
CACHE_TTL = 300  # 5分钟

def scan_shiping_articles():
    """扫描时评库，带缓存（5分钟）"""
    # 尝试读缓存
    if os.path.exists(CACHE_PATH):
        age = time.time() - os.path.getmtime(CACHE_PATH)
        if age < CACHE_TTL:
            try:
                with open(CACHE_PATH, 'rb') as f:
                    return pickle.load(f)
            except:
                pass

    # 重新扫描
    articles = []
    for month_dir in sorted(os.listdir(SHIPING_DIR)):
        full = os.path.join(SHIPING_DIR, month_dir)
        if not os.path.isdir(full) or not month_dir.startswith(('2025', '2026')):
            continue
        for fname in os.listdir(full):
            if not fname.endswith('.md'):
                continue
            fp = os.path.join(full, fname)
            try:
                with open(fp, 'r', encoding='utf-8') as f:
                    content = f.read(3000)
                m = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
                if not m:
                    continue
                fm = m.group(1)
                title_m = re.search(r'^title:\s*(.+)$', fm, re.MULTILINE)
                date_m = re.search(r'^date:\s*(.+)$', fm, re.MULTILINE)
                tags_m = re.search(r'^tags:\s*\[(.+?)\]', fm, re.MULTILINE)
                if not (title_m and date_m):
                    continue
                title = title_m.group(1).strip()
                date = date_m.group(1).strip()
                tags_str = tags_m.group(1) if tags_m else ''
                tags = [t.strip().strip('"').strip("'") for t in tags_str.split(',') if t.strip()]
                # 排除索引文件和README
                if '月度索引' in tags or '索引' in tags:
                    continue
                # 完整抓取 frontmatter 关键字段（用于 /api/articles 全量素材库）
                source_m = re.search(r'^source:\s*(.+)$', fm, re.MULTILINE)
                author_m = re.search(r'^author:\s*(.+)$', fm, re.MULTILINE)
                url_m = re.search(r'^url:\s*(.+)$', fm, re.MULTILINE)
                category_m = re.search(r'^category:\s*(.+)$', fm, re.MULTILINE)
                source_type_m = re.search(r'^source_type:\s*(.+)$', fm, re.MULTILINE)
                month_m = re.search(r'^month:\s*(.+)$', fm, re.MULTILINE)
                articles.append({
                    'norm': normalize_title(title),
                    'title': title,
                    'date': date,
                    'file_path': fp,
                    'tags': tags,
                    'source': source_m.group(1).strip() if source_m else '',
                    'author': author_m.group(1).strip() if author_m else '',
                    'url': url_m.group(1).strip() if url_m else '',
                    'category': category_m.group(1).strip() if category_m else '',
                    'source_type': source_type_m.group(1).strip() if source_type_m else '',
                    'month': month_m.group(1).strip() if month_m else (date[:7] if date else ''),
                })
            except:
                continue

    # 写缓存
    try:
        with open(CACHE_PATH, 'wb') as f:
            pickle.dump(articles, f)
    except:
        pass
    return articles


def select_today_cards(n=None):
    """每日3篇（按天固定）"""
    import random
    cfg = load_config()
    n = n or cfg['daily_count']

    today = datetime.now().strftime("%Y-%m-%d")
    # 用日期做种子，同一天固定
    seed_str = today + "-shiping-cards"
    random.seed(seed_str)

    conn = get_conn()
    all_articles = scan_shiping_articles()
    if not all_articles:
        return []

    # 14天内已读
    cutoff = (datetime.now() - timedelta(days=cfg['history_days_exclude'])).strftime("%Y-%m-%d")
    cur = conn.execute(
        'SELECT DISTINCT norm_title FROM reads WHERE read_at >= ?',
        (cutoff,)
    )
    read_recent = {row['norm_title'] for row in cur.fetchall()}
    cur = conn.execute('SELECT norm_title FROM skips')
    skipped = {row['norm_title'] for row in cur.fetchall()}

    candidates = [a for a in all_articles if a['norm'] not in read_recent and a['norm'] not in skipped]
    if len(candidates) < n:
        candidates = [a for a in all_articles if a['norm'] not in skipped]

    # 7天内主题轮转
    smart = cfg['smart']
    seven_days_ago = (datetime.now() - timedelta(days=smart['theme_rotation_days'])).isoformat()
    cur = conn.execute(
        'SELECT DISTINCT norm_title FROM reads WHERE read_at >= ?',
        (seven_days_ago,)
    )
    recent_reads = {row['norm_title'] for row in cur.fetchall()}
    art_by_norm = {a['norm']: a for a in all_articles}
    theme_count = Counter()
    for norm in recent_reads:
        if norm in art_by_norm:
            for t in art_by_norm[norm]['tags']:
                theme_count[t] += 1
    total = sum(theme_count.values()) or 1

    def score(article):
        s = 1.0
        for t in article['tags']:
            r = theme_count.get(t, 0) / total
            if r > smart['theme_overweight_threshold']:
                s *= 0.7
        # 30天内新文章加权
        new_th = (datetime.now() - timedelta(days=smart['new_article_priority_days'])).strftime("%Y-%m-%d")
        if article['date'] >= new_th:
            s *= 1.4
        # 确定性扰动（用日期+title哈希）
        import hashlib
        h = int(hashlib.md5(article['norm'].encode()).hexdigest(), 16) % 100
        s *= 0.85 + (h / 100) * 0.3
        return s

    candidates.sort(key=score, reverse=True)

    # 难度交替
    if smart.get('difficulty_alternate'):
        for a in candidates:
            try:
                with open(a['file_path'], 'r', encoding='utf-8') as f:
                    body = f.read()
                body = re.sub(r'^---.*?---', '', body, count=1, flags=re.DOTALL)
                body = re.sub(r'#+\s.*$', '', body, flags=re.MULTILINE)
                a['_len'] = len(re.sub(r'\s+', '', body))
            except:
                a['_len'] = 1000
        # 按长度分档
        groups = {0: [], 1: [], 2: []}  # 短/中/长
        for a in candidates:
            if a['_len'] < 1200:
                groups[0].append(a)
            elif a['_len'] < 2000:
                groups[1].append(a)
            else:
                groups[2].append(a)
        selected = []
        # 长-短-中 or 中-长-短 模式
        for g in [2, 0, 1]:
            for a in groups[g]:
                if a not in selected:
                    selected.append(a)
                    if len(selected) >= n:
                        break
            if len(selected) >= n:
                break
        return selected[:n]

    return candidates[:n]


# === API 实现 ===
def get_today_cards():
    cards = select_today_cards()
    # deduplicate by norm
    seen = set()
    unique = []
    for c in cards:
        if c["norm"] not in seen:
            seen.add(c["norm"])
            unique.append(c)
    cards = unique
    # extract content and id for each card
    for c in cards:
        c["id"] = c.get("file_path", c["norm"]).replace("\\\\", "/")
        try:
            with open(c["file_path"], "r", encoding="utf-8") as _f:
                _body = _f.read()
            import re as _re
            _body = _re.sub("^---.*?---\n", "", _body, count=1, flags=_re.DOTALL)
            _body = _re.sub("^#\s+.*?\n", "", _body, count=1, flags=_re.MULTILINE)
            c["content"] = _body.strip()[:500]
        except:
            c["content"] = ""
    return json.dumps({

        'date': datetime.now().strftime("%Y-%m-%d"),
        'count': len(cards),
        'cards': [{
            'norm': c['norm'],
            'title': c['title'],
            'date': c['date'],
            'tags': c['tags'],
            'file_path': c.get('file_path', '').replace('\\', '/'),
        } for c in cards]
    }, ensure_ascii=False)


def get_card_detail():
    """根据 ?norm=xxx 返回单篇正文"""
    return json.dumps({'error': 'use POST'}, ensure_ascii=False)


def list_articles(qs):
    """
    全量素材库列表：?theme= &source= &date= &q= &page= &pageSize=
    返回 { items, total, page, pageSize, themes, sources, dates }
    """
    try:
        theme = (qs.get('theme', [''])[0] or '').strip()
        source = (qs.get('source', [''])[0] or '').strip()
        date = (qs.get('date', [''])[0] or '').strip()    # YYYY / YYYY-MM / YYYY-MM-DD
        q = (qs.get('q', [''])[0] or '').strip()
        try:
            page = max(1, int(qs.get('page', ['1'])[0]))
        except Exception:
            page = 1
        try:
            page_size = max(1, min(200, int(qs.get('pageSize', ['50'])[0])))
        except Exception:
            page_size = 50

        all_articles = scan_shiping_articles()

        filtered = []
        theme_counter = {}
        source_counter = {}
        date_counter = {}
        for a in all_articles:
            if theme and theme not in a.get('tags', []):
                continue
            if source and source not in (a.get('source') or ''):
                continue
            if date:
                # 用 month 字段过滤最稳；fallback 到 date 前缀
                if not (a.get('month', '').startswith(date) or a.get('date', '').startswith(date)):
                    continue
            if q and q not in a.get('title', ''):
                continue
            # 统计 group 维度（基于已过滤集合）
            for t in a.get('tags', []):
                theme_counter[t] = theme_counter.get(t, 0) + 1
            s = a.get('source') or '未署名'
            source_counter[s] = source_counter.get(s, 0) + 1
            m = a.get('month') or (a.get('date', '')[:7] if a.get('date') else '') or '未知月份'
            date_counter[m] = date_counter.get(m, 0) + 1
            filtered.append(a)

        filtered.sort(key=lambda x: x.get('date', ''), reverse=True)

        total = len(filtered)
        start = (page - 1) * page_size
        page_items = filtered[start:start + page_size]

        items = []
        for a in page_items:
            fp = a.get('file_path', '').replace('\\', '/')
            items.append({
                'id': fp,
                'norm': a['norm'],
                'title': a['title'],
                'date': a.get('date', ''),
                'source': a.get('source', ''),
                'author': a.get('author', ''),
                'tags': a.get('tags', []),
                'category': a.get('category', ''),
                'source_type': a.get('source_type', ''),
                'month': a.get('month', ''),
                'url': a.get('url', ''),
                'file_path': fp,
            })

        themes_sorted = sorted(theme_counter.items(), key=lambda x: -x[1])
        sources_sorted = sorted(source_counter.items(), key=lambda x: -x[1])
        dates_sorted = sorted(date_counter.items(), key=lambda x: x[0], reverse=True)

        return json.dumps({
            'items': items,
            'total': total,
            'page': page,
            'pageSize': page_size,
            'themes': [{'key': k, 'count': v} for k, v in themes_sorted],
            'sources': [{'key': k, 'count': v} for k, v in sources_sorted],
            'dates': [{'key': k, 'count': v} for k, v in dates_sorted],
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({'error': str(e), 'items': [], 'total': 0}, ensure_ascii=False)


def get_card_body(norm):
    """根据 norm 读取文件正文并转为 HTML"""
    if not norm:
        return json.dumps({'error': 'missing norm'}, ensure_ascii=False)
    # 优先用缓存
    articles = scan_shiping_articles()
    target = None
    for a in articles:
        if a['norm'] == norm:
            target = a
            break
    if not target:
        return json.dumps({'error': 'not found', 'norm': norm}, ensure_ascii=False)

    fp = target['file_path']
    try:
        with open(fp, 'r', encoding='utf-8') as f:
            content = f.read()
        body = re.sub(r'^---.*?---\n', '', content, count=1, flags=re.DOTALL)
        body = re.sub(r'^#\s+.*?\n', '', body, count=1, flags=re.MULTILINE)
        html = ''
        for line in body.split('\n'):
            line = line.rstrip()
            if not line:
                html += '<p>&nbsp;</p>'
                continue
            if line.startswith('**') and line.endswith('**'):
                html += f'<p><strong>{line.strip("*").strip()}</strong></p>'
            elif line.startswith('>'):
                html += f'<blockquote style="border-left:3px solid #d30000;padding:8px 12px;color:#515154;background:#fff8f8;margin:8px 0">{line.lstrip("> ").strip()}</blockquote>'
            elif line.startswith('- '):
                html += f'<p>• {line[2:]}</p>'
            elif line.startswith('---'):
                html += '<hr style="border:none;border-top:1px dashed #d1d1d6;margin:16px 0">'
            else:
                escaped = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                html += f'<p>{escaped}</p>'
        return json.dumps({
            'norm': norm,
            'title': target['title'],
            'body': html
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({'error': str(e), 'norm': norm}, ensure_ascii=False)


def _extract_title(content):
    m = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not m:
        return ''
    t = re.search(r'^title:\s*(.+)$', m.group(1), re.MULTILINE)
    return t.group(1).strip() if t else ''


def get_stats():
    conn = get_conn()
    today = datetime.now().strftime("%Y-%m-%d")
    seven_days_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    cur = conn.execute('SELECT COUNT(DISTINCT norm_title) as c FROM reads WHERE read_at >= ?', (today,))
    today_reads = cur.fetchone()['c']
    cur = conn.execute('SELECT COUNT(DISTINCT norm_title) as c FROM reads WHERE read_at >= ?', (seven_days_ago,))
    week_reads = cur.fetchone()['c']
    cur = conn.execute('SELECT COUNT(*) as c FROM highlights')
    total_highlights = cur.fetchone()['c']
    cur = conn.execute('SELECT COUNT(*) as c FROM notes')
    total_notes = cur.fetchone()['c']
    return json.dumps({
        'today_reads': today_reads,
        'week_reads': week_reads,
        'total_highlights': total_highlights,
        'total_notes': total_notes,
    }, ensure_ascii=False)


def get_history():
    conn = get_conn()
    cur = conn.execute(
        'SELECT title, date, read_at FROM reads ORDER BY read_at DESC LIMIT 50'
    )
    return json.dumps({
        'history': [dict(row) for row in cur.fetchall()]
    }, ensure_ascii=False)


def get_highlights():
    conn = get_conn()
    cur = conn.execute(
        'SELECT title, content, tags, note, created_at FROM highlights ORDER BY created_at DESC LIMIT 100'
    )
    return json.dumps({
        'highlights': [dict(row) for row in cur.fetchall()]
    }, ensure_ascii=False)


def mark_read(data):
    norm = data.get('norm', '').strip()
    title = data.get('title', '').strip()
    date = data.get('date', '').strip()
    duration = int(data.get('duration', 0))
    if not norm or not title:
        return json.dumps({'ok': False, 'error': 'missing norm/title'}, ensure_ascii=False)
    conn = get_conn()
    now = datetime.now().isoformat(timespec='seconds')
    with db_lock:
        conn.execute(
            'INSERT INTO reads (norm_title, title, date, file_path, read_at, duration_sec) VALUES (?,?,?,?,?,?)',
            (norm, title, date, data.get('file_path', ''), now, duration)
        )
        conn.commit()
    return json.dumps({'ok': True}, ensure_ascii=False)


def save_highlight(data):
    norm = data.get('norm', '').strip()
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    tags = data.get('tags', '')
    note = data.get('note', '')
    if not norm or not content:
        return json.dumps({'ok': False, 'error': 'missing norm/content'}, ensure_ascii=False)
    conn = get_conn()
    now = datetime.now().isoformat(timespec='seconds')
    with db_lock:
        conn.execute(
            'INSERT INTO highlights (norm_title, title, content, tags, note, created_at) VALUES (?,?,?,?,?,?)',
            (norm, title, content, tags, note, now)
        )
        conn.commit()
    return json.dumps({'ok': True}, ensure_ascii=False)


def save_note(data):
    norm = data.get('norm', '').strip()
    title = data.get('title', '').strip()
    content = data.get('content', '').strip()
    if not norm or not content:
        return json.dumps({'ok': False, 'error': 'missing norm/content'}, ensure_ascii=False)
    conn = get_conn()
    now = datetime.now().isoformat(timespec='seconds')
    with db_lock:
        conn.execute(
            'INSERT INTO notes (norm_title, title, content, created_at) VALUES (?,?,?,?)',
            (norm, title, content, now)
        )
        conn.commit()
    return json.dumps({'ok': True}, ensure_ascii=False)


def skip_card(data):
    norm = data.get('norm', '').strip()
    if not norm:
        return json.dumps({'ok': False, 'error': 'missing norm'}, ensure_ascii=False)
    conn = get_conn()
    with db_lock:
        conn.execute('INSERT OR IGNORE INTO skips (norm_title) VALUES (?)', (norm,))
        conn.commit()
    return json.dumps({'ok': True}, ensure_ascii=False)


# === HTML 页面 ===
INDEX_HTML = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>申论每日选卡</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; background: #f5f5f7; color: #1d1d1f; padding: 0; min-height: 100vh; }
.header { background: linear-gradient(135deg, #d30000 0%, #8b0000 100%); color: white; padding: 24px 20px 20px; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
.header h1 { font-size: 22px; font-weight: 600; margin-bottom: 6px; }
.header .date { font-size: 13px; opacity: 0.9; }
.header .stats { display: flex; gap: 16px; margin-top: 12px; font-size: 12px; }
.header .stats span { background: rgba(255,255,255,0.18); padding: 4px 10px; border-radius: 12px; }
.container { padding: 16px; max-width: 720px; margin: 0 auto; }
.card { background: white; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.3s; }
.card.read { opacity: 0.55; background: #f0f0f0; }
.card-title { font-size: 17px; font-weight: 600; line-height: 1.5; margin-bottom: 10px; color: #1d1d1f; }
.card-meta { font-size: 12px; color: #86868b; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.card-meta .tag { background: #f0f0f0; padding: 3px 8px; border-radius: 6px; color: #515154; font-size: 11px; }
.card-body { font-size: 14px; line-height: 1.7; color: #424245; max-height: 0; overflow: hidden; transition: max-height 0.4s; }
.card-body.open { max-height: 8000px; }
.card-body p { margin-bottom: 12px; }
.card-actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
.btn { padding: 10px 14px; border: none; border-radius: 10px; font-size: 13px; cursor: pointer; font-weight: 500; transition: all 0.2s; background: #f0f0f0; color: #1d1d1f; }
.btn:active { transform: scale(0.96); }
.btn-primary { background: #d30000; color: white; }
.btn-success { background: #34c759; color: white; }
.btn-warn { background: #ff9500; color: white; }
.btn-blue { background: #007aff; color: white; }
.btn-purple { background: #af52de; color: white; }
.btn:disabled { opacity: 0.4; }
.tabs { display: flex; gap: 6px; padding: 12px 16px; background: white; border-bottom: 1px solid #e5e5ea; position: sticky; top: 100px; z-index: 9; overflow-x: auto; }
.tab { padding: 8px 14px; border-radius: 18px; background: #f0f0f0; color: #515154; font-size: 13px; cursor: pointer; white-space: nowrap; }
.tab.active { background: #d30000; color: white; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; padding: 16px; z-index: 100; }
.modal.show { display: flex; }
.modal-content { background: white; border-radius: 16px; padding: 20px; width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; }
.modal h3 { margin-bottom: 12px; font-size: 17px; }
.modal textarea, .modal input { width: 100%; padding: 10px; border: 1px solid #d1d1d6; border-radius: 8px; font-size: 14px; margin: 8px 0; font-family: inherit; }
.modal textarea { min-height: 80px; resize: vertical; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
.tag-input { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px; border: 1px solid #d1d1d6; border-radius: 8px; min-height: 36px; }
.tag-chip { background: #d30000; color: white; padding: 3px 8px; border-radius: 12px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }
.tag-chip span { cursor: pointer; font-weight: bold; }
.empty { text-align: center; padding: 40px 20px; color: #86868b; }
.fab { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%; background: #d30000; color: white; border: none; font-size: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); cursor: pointer; }
.fab:active { transform: scale(0.95); }
.section { display: none; }
.section.active { display: block; }
.tip { font-size: 12px; color: #86868b; margin-top: 8px; }
</style>
</head>
<body>

<div class="header">
  <h1>📚 申论每日选卡</h1>
  <div class="date" id="date"></div>
  <div class="stats">
    <span>📖 今日 <b id="todayReads">0</b>/<b id="totalCards">0</b></span>
    <span>📅 7天 <b id="weekReads">0</b></span>
    <span>⭐ 金句 <b id="totalHighlights">0</b></span>
  </div>
</div>

<div class="tabs">
  <div class="tab active" data-tab="today">今日卡片</div>
  <div class="tab" data-tab="history">阅读记录</div>
  <div class="tab" data-tab="highlights">金句库</div>
</div>

<div class="container">

<div class="section active" id="sec-today">
  <div id="cards"></div>
</div>

<div class="section" id="sec-history">
  <div id="history"></div>
</div>

<div class="section" id="sec-highlights">
  <div id="highlights"></div>
</div>

</div>

<!-- 金句收藏弹窗 -->
<div class="modal" id="modal-highlight">
  <div class="modal-content">
    <h3>⭐ 收藏金句</h3>
    <div class="tip">选中的段落：</div>
    <textarea id="hl-content" placeholder="在这里粘贴选中的段落..."></textarea>
    <div class="tip">标签（用逗号或空格分隔）：</div>
    <input id="hl-tags" placeholder="如：科技创新, 重要, 开头可引用">
    <div class="tip">备注：</div>
    <textarea id="hl-note" placeholder="为什么收藏？可应用在什么场景？" style="min-height:50px;"></textarea>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('modal-highlight')">取消</button>
      <button class="btn btn-primary" onclick="submitHighlight()">保存</button>
    </div>
  </div>
</div>

<!-- 笔记弹窗 -->
<div class="modal" id="modal-note">
  <div class="modal-content">
    <h3>📝 写笔记</h3>
    <div class="tip">对本文的思考、应用、疑问等：</div>
    <textarea id="note-content" placeholder="读完这篇我想到..." style="min-height:140px;"></textarea>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('modal-note')">取消</button>
      <button class="btn btn-primary" onclick="submitNote()">保存</button>
    </div>
  </div>
</div>

<script>
// 全局状态
let todayCards = [];
let currentCardIndex = 0;
let readStartTime = 0;
let currentHighlight = { norm: '', title: '' };
let currentNote = { norm: '', title: '' };

// 初始化
document.getElementById('date').textContent = new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric', weekday:'long' });

// 标签页切换
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('sec-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'history') loadHistory();
    if (tab.dataset.tab === 'highlights') loadHighlights();
  });
});

// 加载今日卡片
async function loadToday() {
  const r = await fetch('/api/today');
  const data = await r.json();
  todayCards = data.cards;
  document.getElementById('totalCards').textContent = todayCards.length;
  renderCards();
  loadStats();
}

// 渲染卡片
function renderCards() {
  const container = document.getElementById('cards');
  if (todayCards.length === 0) {
    container.innerHTML = '<div class="empty">暂无推荐，请稍后再来</div>';
    return;
  }
  container.innerHTML = todayCards.map((c, i) => `
    <div class="card" id="card-${i}" data-norm="${c.norm}">
      <div class="card-title">${i+1}. ${c.title}</div>
      <div class="card-meta">
        <span>📅 ${c.date}</span>
        ${(c.tags || []).slice(0, 4).map(t => `<span class="tag">#${t}</span>`).join('')}
      </div>
      <div class="card-body" id="body-${i}">
        <div style="color:#86868b;padding:8px 0">加载中...</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-primary" onclick="toggleBody(${i})">📖 展开全文</button>
        <button class="btn btn-success" onclick="markRead(${i})">✅ 已读完</button>
        <button class="btn btn-warn" onclick="openHighlight(${i})">⭐ 收藏</button>
        <button class="btn btn-blue" onclick="openNote(${i})">📝 笔记</button>
        <button class="btn btn-purple" onclick="skipCard(${i})">🔄 换一篇</button>
      </div>
    </div>
  `).join('');
}

// 展开/折叠全文
async function toggleBody(i) {
  const body = document.getElementById('body-' + i);
  if (body.classList.contains('open')) {
    body.classList.remove('open');
    return;
  }
  if (!body.dataset.loaded) {
    // 加载正文
    const c = todayCards[i];
    const r = await fetch(c.file_path).catch(() => null);
    // 由于 CORS，实际通过 fetch 加载本地文件可能失败，改用 getCard 方式
    // 这里用专门的 API 获取
    body.innerHTML = '<div style="color:#86868b;padding:8px 0">正在加载正文...</div>';
    body.classList.add('open');
    try {
      const r2 = await fetch('/api/card?norm=' + encodeURIComponent(c.norm));
      const d = await r2.json();
      if (d.body) {
        body.innerHTML = d.body;
        body.dataset.loaded = '1';
      } else {
        body.innerHTML = '<div style="color:#ff9500">正文获取失败：' + (d.error || '未知') + '</div>';
      }
    } catch(e) {
      body.innerHTML = '<div style="color:#ff9500">网络错误：' + e.message + '</div>';
    }
  } else {
    body.classList.add('open');
  }
}

// 标记已读
async function markRead(i) {
  const c = todayCards[i];
  const duration = readStartTime ? Math.round((Date.now() - readStartTime) / 1000) : 0;
  await fetch('/api/mark-read', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ norm: c.norm, title: c.title, date: c.date, file_path: c.file_path || '', duration })
  });
  document.getElementById('card-' + i).classList.add('read');
  loadStats();
}

// 换一篇
async function skipCard(i) {
  const c = todayCards[i];
  await fetch('/api/skip', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ norm: c.norm })
  });
  // 重新选卡
  const r = await fetch('/api/today');
  const data = await r.json();
  todayCards = data.cards;
  renderCards();
  loadStats();
}

// 打开金句弹窗
function openHighlight(i) {
  const c = todayCards[i];
  currentHighlight = { norm: c.norm, title: c.title };
  // 如果展开了正文，预填选中的（简化：留空用户粘贴）
  const body = document.getElementById('body-' + i);
  if (body && body.dataset.loaded) {
    const sel = window.getSelection().toString();
    if (sel) document.getElementById('hl-content').value = sel;
  }
  // 预填标签
  document.getElementById('hl-tags').value = (c.tags || []).slice(0, 3).join(', ');
  document.getElementById('hl-note').value = '';
  document.getElementById('modal-highlight').classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

async function submitHighlight() {
  const content = document.getElementById('hl-content').value.trim();
  const tags = document.getElementById('hl-tags').value.trim();
  const note = document.getElementById('hl-note').value.trim();
  if (!content) { alert('请输入金句内容'); return; }
  const r = await fetch('/api/highlight', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ norm: currentHighlight.norm, title: currentHighlight.title, content, tags, note })
  });
  const d = await r.json();
  if (d.ok) {
    closeModal('modal-highlight');
    loadStats();
    alert('⭐ 金句已收藏！');
  }
}

function openNote(i) {
  const c = todayCards[i];
  currentNote = { norm: c.norm, title: c.title };
  document.getElementById('note-content').value = '';
  document.getElementById('modal-note').classList.add('show');
}

async function submitNote() {
  const content = document.getElementById('note-content').value.trim();
  if (!content) { alert('请输入笔记内容'); return; }
  const r = await fetch('/api/note', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ norm: currentNote.norm, title: currentNote.title, content })
  });
  const d = await r.json();
  if (d.ok) {
    closeModal('modal-note');
    loadStats();
    alert('📝 笔记已保存！');
  }
}

// 统计
async function loadStats() {
  const r = await fetch('/api/stats');
  const d = await r.json();
  document.getElementById('todayReads').textContent = d.today_reads;
  document.getElementById('weekReads').textContent = d.week_reads;
  document.getElementById('totalHighlights').textContent = d.total_highlights;
}

// 历史
async function loadHistory() {
  const r = await fetch('/api/history');
  const d = await r.json();
  const container = document.getElementById('history');
  if (!d.history || d.history.length === 0) {
    container.innerHTML = '<div class="empty">还没有阅读记录<br><br>点击卡片上的"已读完"开始记录</div>';
    return;
  }
  container.innerHTML = d.history.map(h => `
    <div class="card">
      <div class="card-title" style="font-size:15px">${h.title}</div>
      <div class="card-meta">
        <span>📅 文章 ${h.date}</span>
        <span>⏰ 阅读于 ${h.read_at}</span>
      </div>
    </div>
  `).join('');
}

// 金句库
async function loadHighlights() {
  const r = await fetch('/api/highlights');
  const d = await r.json();
  const container = document.getElementById('highlights');
  if (!d.highlights || d.highlights.length === 0) {
    container.innerHTML = '<div class="empty">还没有金句<br><br>点击卡片上的"收藏"开始积累</div>';
    return;
  }
  container.innerHTML = d.highlights.map(h => `
    <div class="card">
      <div class="card-meta"><span>📅 ${h.created_at}</span></div>
      <div style="background:#fff8e1;padding:12px;border-radius:8px;margin:8px 0;font-size:14px;line-height:1.7;border-left:3px solid #ff9500">"${h.content}"</div>
      <div class="card-meta">${(h.tags || '').split(',').filter(t=>t.trim()).map(t => `<span class="tag">#${t.trim()}</span>`).join('')}</div>
      ${h.note ? '<div style="font-size:12px;color:#515154;margin-top:6px">💭 ' + h.note + '</div>' : ''}
      <div style="font-size:11px;color:#86868b;margin-top:6px">来源：《${h.title}》</div>
    </div>
  `).join('');
}

readStartTime = Date.now();
loadToday();
</script>
</body>
</html>
'''


def load_index():
    return INDEX_HTML


# === 启动 ===
def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("223.5.5.5", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"


if __name__ == "__main__":
    cfg = load_config()
    port = cfg['port']
    host = cfg['host']

    # 初始化 DB
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''CREATE TABLE IF NOT EXISTS reads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        norm_title TEXT NOT NULL, title TEXT NOT NULL, date TEXT,
        file_path TEXT, read_at TEXT NOT NULL, duration_sec INTEGER DEFAULT 0
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS highlights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        norm_title TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
        tags TEXT, note TEXT, created_at TEXT NOT NULL
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        norm_title TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
        created_at TEXT NOT NULL
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS skips (
        norm_title TEXT PRIMARY KEY
    )''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_reads_date ON reads(read_at)')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_reads_norm ON reads(norm_title)')
    conn.commit()
    conn.close()

    server = ThreadingHTTPServer((host, port), CardHandler)
    local_ip = get_local_ip()
    print(f"=" * 60)
    print(f"✅ 选卡阅读服务已启动")
    print(f"=" * 60)
    print(f"  本机访问: http://localhost:{port}")
    print(f"  手机访问: http://{local_ip}:{port}")
    print(f"=" * 60)
    print(f"  知识库: {SHIPING_DIR}")
    print(f"  数据库: {DB_PATH}")
    print(f"  每日: {cfg['daily_count']} 篇")
    print(f"=" * 60)
    print(f"  按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.shutdown()