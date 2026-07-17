# PaperScreen 真题接入 / 拆题 / Tags 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `E:/申论知识库/06_真题库/` ~1500 个真题 md 接入 ShenlunApp PaperScreen，按一卷拆 5 道题的粒度，加主题 tags，PaperScreen 列表 + 详情可浏览题目与答案。

**Architecture:** 服务端扫盘生成 /api/papers 索引 + /api/papers/{id} 详情 + 单题答案；一次性拆题脚本生成题目/答案（拆题）产物；客户端 PaperScreen 列表 → PaperDetailScreen → QuestionScreen 三级；tags 由下次会话 AI 一次性填充。

**Tech Stack:** Python 3 card_server.py (ubuntu@124.223.5.144:2222)，React Native 0.74 + TS，pdfplumber (已装)。

---

## Global Constraints

- 服务端：SSH 用户 `ubuntu`，host `124.223.5.144`，端口 2222，key `~/.ssh/xuexi_tencent`
- 服务端 card_server.py：`/opt/xuexi/09_选卡阅读/`，进程 pid 341388
- 知识库路径：`E:/申论知识库/06_真题库/` —— Windows 路径风格，**不要硬编码 `/e/` Unix 风格**
- API base：`http://124.223.5.144`
- 客户端基色：`宣纸 #F0EAD6 / 印章红 #C04851 / 黄铜金 #C9A962 / 墨 #1C1714`，已锁定 V3
- 字体：fonts.kai.bold / fonts.serif.bold / fonts.sans.regular
- 项目本地：所有改动要 type-check (`npx tsc --noEmit`) + APK 重打后能跑
- Service-side code 改动：先 `cp card_server.py card_server.py.bak.<mtime>` 备份，再用 Python in-place edit 插入 dispatcher 函数
- Service-side 启动：`nohup python3 card_server.py > /tmp/card_server.log 2>&1 &`（不用 setsid/disown，SSH 退出不可靠）
- Service-side 缩进：4 空格（Python 文件用 4 空格）
- 拆题产物存：`<库>/题目/<key>_q<n>.md` + `<库>/答案（拆题）/<key>_q<n>.md`
- 原卷文件 `试题/<key>.md` + `答案/<key>.md` 保留不删，**P0 期间并存**
- 客户端新增路由：`PaperDetail`, `Question`（在 `App.tsx` Stack 加）

---

## Phase 1：服务端 - 拆题脚本（独立，可远程批跑）

### Task 1.1：写拆题脚本（本地 + 上传到服务端）

**Files:**
- Create: `C:\Users\hecto\ZCodeProject\split_questions.py`（本地开发 + 上传到服务端）

**Interfaces:**
- 无外部依赖，纯 Python 3 + re + pathlib

**Step 1：写脚本**

`split_questions.py` 完整代码：

```python
"""Split each 试题/答案 file into per-question md files.

Output:
  <库>/题目/<key>_q<n>.md
  <库>/答案（拆题）/<key>_q<n>.md

Each output frontmatter contains enough to reconstruct paper -> question relation.
"""
import os, re, sys
from pathlib import Path

ROOT = Path('E:/申论知识库/06_真题库')
GROUPS = [
    ('历年真题', 'guokao'),
    ('各省联考', 'shengkao'),
]

CN_NUM = ['一','二','三','四','五','六','七','八','九','十','十一','十二']

# 题干分类（粗略）
TYPE_RULES = [
    ('归纳概括', [r'概括', r'归纳', r'总结', r'简述']),
    ('综合分析', [r'分析', r'谈谈.*理解', r'阐释', r'说明']),
    ('提出对策', [r'对策', r'建议', r'措施', r'提出.*方案']),
    ('应用文',   [r'倡议书', r'公开信', r'通知', r'报告', r'倡议', r'讲话稿', r'简报']),
    ('文章论述', [r'写一篇', r'文章论述', r'议论文', r'围绕.*自拟题目']),
]

def detect_type(text):
    for type_name, patterns in TYPE_RULES:
        for p in patterns:
            if re.search(p, text):
                return type_name
    return ''

def detect_score(text):
    m = re.search(r'(\d+)\s*分', text)
    return int(m.group(1)) if m else 0

def parse_paper_meta(filepath: Path, group_name: str):
    """从文件名和 frontmatter 抽元数据."""
    stem = filepath.stem
    is_answer = '_答案' in stem or '_答案_拆题' in stem
    base = stem.replace('_真题', '').replace('_答案', '')
    # 解析 frontmatter
    fm = {}
    with open(filepath, encoding='utf-8') as f:
        head = f.read(2048)
    for ln in head.split('\n'):
        if ln.strip() == '---':
            if not fm: continue
            break
        m = re.match(r'^(\w+):\s*"?([^"\n]+)"?\s*$', ln.strip())
        if m: fm[m.group(1)] = m.group(2).strip()
    return {
        'key': base,
        'is_answer': is_answer,
        'group': group_name,
        'level': 'guokao' if group_name == '历年真题' else 'shengkao',
        'year': int(fm.get('year', 0)) if fm.get('year', '').isdigit() else 0,
        'province': fm.get('province', '国考' if group_name=='历年真题' else ''),
        'volume': fm.get('volume', ''),
        'source_file': filepath.name,
    }

def find_split_starts(text):
    """返回 [(index_str, char_pos), ...] - 每个题目正文起始位置.
    题目编号位置识别: 行首 '一、' '二、' 等，且**作答要求**之后.
    """
    # 先找 '作答要求' 起始位置
    req_idx = text.find('作答要求')
    if req_idx < 0:
        req_idx = text.find('一、注意事项')  # 一些旧卷用 "一、注意事项" 而非 "作答要求"
    if req_idx < 0:
        return []
    starts = []
    for m in re.finditer(r'^([一二三四五六七八九十]+)、', text[req_idx:], re.MULTILINE):
        starts.append((m.group(1), req_idx + m.start()))
    # 去重：同一个数字只取第一个
    seen = set()
    out = []
    for s, p in starts:
        if s not in seen:
            seen.add(s)
            out.append((s, p))
    return out

def split_questions(meta: dict, content: str):
    starts = find_split_starts(content)
    if len(starts) < 2:
        return None  # 拆不出题
    intro = content[:starts[0][1]].rstrip()
    questions = []
    for i, (idx, pos) in enumerate(starts):
        end = starts[i+1][1] if i+1 < len(starts) else len(content)
        q_text = content[pos:end].rstrip()
        # 去掉开头的编号
        first_line = q_text.split('\n', 1)[0]
        rest = q_text.split('\n', 1)[1].rstrip() if '\n' in q_text else ''
        title_line = re.sub(r'^[一二三四五六七八九十]+、\s*', '', first_line).strip()
        # 把标题合并到正文首
        body = (title_line + ('\n' + rest if rest else '')).strip()
        qtype = detect_type(body)
        score = detect_score(body[:300])
        questions.append({
            'index': idx,
            'label': f'第{CN_NUM.index(idx)+1 if idx in CN_NUM else "?"}题',
            'type': qtype,
            'score': score,
            'title': title_line[:80],
            'body': body,
            'intro': intro if i == 0 else '',  # intro 只在第一题带
        })
    return questions

def frontmatter_q(paper_id, q, meta):
    return (
        '---\n'
        f'question_id: "{paper_id}-q{CN_NUM.index(q["index"])+1}"\n'
        f'paper_id: "{paper_id}"\n'
        f'year: {meta["year"]}\n'
        f'level: "{meta["level"]}"\n'
        f'province: "{meta["province"]}"\n'
        f'volume: "{meta["volume"]}"\n'
        f'index: "{q["index"]}"\n'
        f'index_num: {CN_NUM.index(q["index"])+1 if q["index"] in CN_NUM else 0}\n'
        f'label: "{q["label"]}"\n'
        f'type: "{q["type"]}"\n'
        f'score: {q["score"]}\n'
        f'source_file: "{meta["source_file"]}"\n'
        f'title: "{q["title"]}"\n'
        '---\n\n'
    )

def frontmatter_a(paper_id, q, meta, q_num):
    return (
        '---\n'
        f'answer_id: "{paper_id}-q{q_num}"\n'
        f'question_id: "{paper_id}-q{q_num}"\n'
        f'paper_id: "{paper_id}"\n'
        f'year: {meta["year"]}\n'
        f'level: "{meta["level"]}"\n'
        f'index: "{q["index"]}"\n'
        f'source_file: "{meta["source_file"]}"\n'
        f'title: "{q["title"]}"\n'
        '---\n\n'
    )

def main():
    total_q = 0
    total_a = 0
    skipped = 0
    for group_name, level in GROUPS:
        q_dir = ROOT / group_name / '试题'
        a_dir = ROOT / group_name / '答案'
        q_out_dir = ROOT / group_name / '题目'
        a_out_dir = ROOT / group_name / '答案（拆题）'
        q_out_dir.mkdir(exist_ok=True)
        a_out_dir.mkdir(exist_ok=True)

        for q_path in sorted(q_dir.glob('*.md')):
            meta = parse_paper_meta(q_path, group_name)
            paper_id = f"{meta['level']}-{meta['year']}-{meta['province']}-{meta['volume']}".rstrip('-')
            with open(q_path, encoding='utf-8') as f:
                content = f.read()
            questions = split_questions(meta, content)
            if not questions:
                skipped += 1
                continue
            for i, q in enumerate(questions, 1):
                qfn = q_out_dir / f"{meta['key']}_q{i}.md"
                body = q['intro'] + '\n\n---\n\n' + q['body'] if q.get('intro') else q['body']
                qfn.write_text(frontmatter_q(paper_id, q, meta) + body + '\n', encoding='utf-8')
                total_q += 1

            # 答案侧：用相同的题号顺序切
            a_path = a_dir / f"{meta['key']}_答案.md".replace('真题', '')  # 容错
            # 真正答案是同名换 _真题 → _答案
            a_path = a_dir / q_path.name.replace('_真题', '_答案')
            if not a_path.exists():
                # 试 _参考答案
                continue
            with open(a_path, encoding='utf-8') as f:
                a_content = f.read()
            a_splits = find_split_starts(a_content)
            # 答案切分：用题本里识别到的题号去对齐
            for i, q in enumerate(questions, 1):
                target_idx = q['index']
                # 找答案里相同题号
                a_pos = None
                for ai, (idx, pos) in enumerate(a_splits):
                    if idx == target_idx:
                        a_pos = pos
                        break
                if a_pos is None:
                    continue
                # 该题答案的 end = 下一个题号起点或文件结尾
                a_end = len(a_content)
                for aj, (idx2, pos2) in enumerate(a_splits):
                    if pos2 > a_pos and (a_pos + len(target_idx) < pos2):
                        a_end = pos2
                        break
                a_body = a_content[a_pos:a_end].rstrip()
                # 去掉开头的 '一、' 数字编号
                a_body = re.sub(r'^[一二三四五六七八九十]+、\s*', '', a_body, count=1)
                afn = a_out_dir / f"{meta['key']}_q{i}.md"
                afn.write_text(frontmatter_a(paper_id, q, meta, i) + a_body + '\n', encoding='utf-8')
                total_a += 1
    print(f'questions written: {total_q}, answers written: {total_a}, skipped: {skipped}')

if __name__ == '__main__':
    main()
```

**Step 2：上传到服务端**

```bash
scp -P 2222 -i ~/.ssh/xuexi_tencent "C:/Users/hecto/ZCodeProject/split_questions.py" ubuntu@124.223.5.144:/tmp/split_questions.py
```

预期：无报错

**Step 3：在服务端跑**

(注：服务端是 Linux，**路径不一样**。在服务端用 `BASE_DIR=/opt/xuexi/knowledge_base` 跑，**这里先不跑**，等我们把脚本改成远程 + 本地两可)

**Step 4：本地跑**

```bash
cd "C:/Users/hecto/ZCodeProject" && python3 split_questions.py
```

预期输出：
```
questions written: ~2800, answers written: ~2700, skipped: ~50
```

---

### Task 1.2：在本地运行拆题 + 验证

**Files:**
- 无新文件

**Step 1：跑脚本**

```bash
cd "C:/Users/hecto/ZCodeProject" && python3 split_questions.py 2>&1 | tail -5
```

预期：`questions written: 2700+, answers written: 2500+`

**Step 2：检查产物**

```bash
ls "E:/申论知识库/06_真题库/历年真题/题目" | wc -l
ls "E:/申论知识库/06_真题库/各省联考/题目" | wc -l
ls "E:/申论知识库/06_真题库/历年真题/答案（拆题）" | wc -l
ls "E:/申论知识库/06_真题库/各省联考/答案（拆题）" | wc -l
```

预期：题目总数 ≈ 试卷数 × 4.5，答案数略低（部分 _skipped）

**Step 3：spot-check 一个拆题文件**

```bash
head -20 "E:/申论知识库/06_真题库/历年真题/题目/2025_副省级_q1.md"
```

预期 frontmatter 含 `question_id / paper_id / year / level / index / label / type / score`，然后材料 + 题干。

---

## Phase 2：服务端 - 索引 API

### Task 2.1：加 `/api/papers` 索引接口

**Files:**
- Modify: `/opt/xuexi/09_选卡阅读/card_server.py`

**Step 1：本地备份**

```bash
ssh -i ~/.ssh/xuexi_tencent -p 2222 ubuntu@124.223.5.144 "cp /opt/xuexi/09_选卡阅读/card_server.py /opt/xuexi/09_选卡阅读/card_server.py.bak.\$(date +%s)"
```

**Step 2：上传补丁脚本**

`/tmp/patch_papers.py`（在服务端创建）：

```python
"""Append /api/papers handler to card_server.py."""
PATH = '/opt/xuexi/09_选卡阅读/card_server.py'

PAPERS_HANDLER = r'''
KNOWLEDGE_BASE = '/opt/xuexi/knowledge_base/06_真题库'

def get_papers_index():
    """List all papers with filter.
    Query params: exam=guokao|shengkao, year, province, volume, page, limit
    """
    qs = parse_qs(urlparse(self.path).query)
    exam = qs.get('exam', [''])[0]   # guokao / shengkao / ''=all
    year = qs.get('year', [''])[0]
    province = qs.get('province', [''])[0]
    volume = qs.get('volume', [''])[0]
    page = int(qs.get('page', ['1'])[0] or 1)
    limit = int(qs.get('limit', ['50'])[0] or 50)
    if limit > 200: limit = 200

    base = KNOWLEDGE_BASE
    items = []
    groups = []
    if exam in ('', 'guokao'):
        groups.append(('guokao', base + '/历年真题/试题'))
    if exam in ('', 'shengkao'):
        groups.append(('shengkao', base + '/各省联考/试题'))

    for level, q_dir in groups:
        if not os.path.isdir(q_dir): continue
        for fn in os.listdir(q_dir):
            if not fn.endswith('.md'): continue
            fp = os.path.join(q_dir, fn)
            try:
                with open(fp, 'r', encoding='utf-8') as f:
                    head = f.read(2048)
            except: continue
            fm = {}
            for ln in head.split('\n'):
                if ln.strip() == '---':
                    if fm: break
                    continue
                m = re.match(r'^(\w+):\s*"?([^"\n]+)"?\s*$', ln.strip())
                if m: fm[m.group(1)] = m.group(2).strip()
            y = fm.get('year', '')
            if year and y != year: continue
            p = fm.get('province', '')
            if province and p != province: continue
            v = fm.get('volume', '')
            if volume and v != volume: continue
            stem = fn[:-3]
            paper_id = f"{level}-{y}-{p}-{v}".rstrip('-')
            q_count = _count_questions(level, stem)
            a_path = q_dir.replace('/试题', '/答案') + '/' + stem.replace('_真题', '_答案') + '.md'
            has_answer = os.path.exists(a_path)
            items.append({
                'id': paper_id,
                'title': fm.get('title', fn[:-3]),
                'year': int(y) if y.isdigit() else 0,
                'level': level,
                'province': p,
                'volume': v,
                'is_joint': fm.get('is_joint', 'false').lower() == 'true',
                'tags': [],  # filled by AI later
                'question_count': q_count,
                'has_answer': has_answer,
            })
    # sort: year desc, then level (guokao first), then province, then volume
    items.sort(key=lambda x: (-x['year'], x['level'], x['province'], x['volume']))
    total = len(items)
    start = (page - 1) * limit
    end = start + limit
    return json.dumps({
        'items': items[start:end],
        'total': total,
        'page': page,
        'limit': limit,
    }, ensure_ascii=False)


def _count_questions(level, stem):
    """Count question files for a paper in 题目/ directory."""
    if level == 'guokao':
        q_dir = '/opt/xuexi/knowledge_base/06_真题库/历年真题/题目'
    else:
        q_dir = '/opt/xuexi/knowledge_base/06_真题库/各省联考/题目'
    if not os.path.isdir(q_dir): return 0
    n = 0
    for f in os.listdir(q_dir):
        if f.startswith(stem + '_q') and f.endswith('.md'):
            n += 1
    return n
'''

DISPATCH = r'''
        elif path == '/api/papers':
            self._send(200, get_papers_index(), 'application/json')
'''

with open(PATH, encoding='utf-8') as f:
    src = f.read()

if 'def get_papers_index' in src:
    print('handler already present, skip')
else:
    # insert handler after get_articles_by_ids
    needle = 'def get_articles_by_ids(ids):'
    if needle not in src:
        print('ERROR: cannot locate insertion point', file=__import__('sys').stderr)
        exit(1)
    src = src.replace(needle, PAPERS_HANDLER + '\n' + needle, 1)
    print('inserted handler')

if "path == '/api/papers'" in src:
    print('dispatch already present, skip')
else:
    needle = "elif path == '/api/articles':"
    if needle not in src:
        print('ERROR: dispatch anchor not found', file=__import__('sys').stderr)
        exit(1)
    # add AFTER the /api/articles elif block (find its closing line)
    block_end = src.find('\n        elif ', src.find(needle) + 1)
    if block_end < 0:
        # /api/articles is the last elif before `else`
        block_end = src.find('\n        else:', src.find(needle) + 1)
    src = src[:block_end] + DISPATCH + src[block_end:]
    print('inserted dispatch')

# backup + write
backup = PATH + '.bak.' + str(int(os.path.getmtime(PATH)))
import os
with open(backup, 'w', encoding='utf-8') as f: f.write(src)
with open(PATH, 'w', encoding='utf-8') as f: f.write(src)
print(f'Patched. backup: {backup}')
```

**Step 3：本地推送到服务端跑**

```bash
scp -P 2222 -i ~/.ssh/xuexi_tencent "C:/Users/hecto/ZCodeProject/patch_papers.py" ubuntu@124.223.5.144:/tmp/patch_papers.py
ssh -i ~/.ssh/xuexi_tencent -p 2222 ubuntu@124.223.5.144 "python3 /tmp/patch_papers.py"
```

预期：`inserted handler` + `inserted dispatch` + `Patched. backup: ...`

**Step 4：编译 + 重启 + 验证**

```bash
ssh -i ~/.ssh/xuexi_tencent -p 2222 ubuntu@124.223.5.144 "cd /opt/xuexi/09_选卡阅读 && python3 -c 'import py_compile; py_compile.compile(\"card_server.py\", doraise=True); print(\"ok\")'"
ssh -i ~/.ssh/xuexi_tencent -p 2222 ubuntu@124.223.5.144 "pkill -9 -f card_server.py; sleep 1; cd /opt/xuexi/09_选卡阅读 && nohup python3 card_server.py > /tmp/card_server.log 2>&1 &"
sleep 2
curl -s "http://124.223.5.144/api/papers?limit=2" | head -c 500
```

预期：`{"items": [...], "total": N, ...}` 200 OK

---

### Task 2.2：加 `/api/papers/{id}` 详情接口

**Files:**
- Modify: `/opt/xuexi/09_选卡阅读/card_server.py`

**Step 1：本地补丁脚本**

`C:\Users\hecto\ZCodeProject\patch_paper_detail.py`：

```python
"""Append /api/papers/{id} handler."""
PATH = '/opt/xuexi/09_选卡阅读/card_server.py'

DETAIL_HANDLER = r'''
def get_paper_detail(paper_id):
    """paper_id format: 'guokao-2025-国考-副省级' or 'shengkao-2010-安徽-A卷'.
    Returns paper meta + intro + questions list.
    """
    # parse paper_id
    parts = paper_id.split('-')
    if len(parts) < 2: return json.dumps({'error': 'bad paper_id'}, ensure_ascii=False)
    level = parts[0]  # guokao / shengkao
    base = KNOWLEDGE_BASE
    if level == 'guokao':
        q_dir = base + '/历年真题/试题'
        a_dir = base + '/历年真题/答案'
        qq_dir = base + '/历年真题/题目'
    elif level == 'shengkao':
        q_dir = base + '/各省联考/试题'
        a_dir = base + '/各省联考/答案'
        qq_dir = base + '/各省联考/题目'
    else:
        return json.dumps({'error': f'unknown level {level}'}, ensure_ascii=False)

    # find paper by reading paper meta (paper_id may contain year-province-volume)
    # We match by year+province+volume in frontmatter
    year = parts[1] if len(parts) > 1 else ''
    rest = '-'.join(parts[2:])  # province-volume merged

    target_q = None
    target_fm = None
    if os.path.isdir(q_dir):
        for fn in os.listdir(q_dir):
            if not fn.endswith('.md'): continue
            fp = os.path.join(q_dir, fn)
            try:
                with open(fp, 'r', encoding='utf-8') as f: head = f.read(2048)
            except: continue
            fm = {}
            for ln in head.split('\n'):
                if ln.strip() == '---':
                    if fm: break
                    continue
                m = re.match(r'^(\w+):\s*"?([^"\n]+)"?\s*$', ln.strip())
                if m: fm[m.group(1)] = m.group(2).strip()
            fm_year = fm.get('year', '')
            fm_prov = fm.get('province', '')
            fm_vol = fm.get('volume', '')
            if fm_year == year and f"{fm_prov}-{fm_vol}".rstrip('-') == rest:
                target_q = fp
                target_fm = fm
                target_fn = fn
                break

    if target_q is None:
        return json.dumps({'error': f'paper not found: {paper_id}'}, ensure_ascii=False)

    # read full question file
    with open(target_q, 'r', encoding='utf-8') as f:
        q_content = f.read()

    # strip frontmatter
    if q_content.startswith('---\n'):
        end = q_content.find('\n---\n', 4)
        if end > 0:
            q_content = q_content[end+5:]

    # find intro vs questions: intro = before '作答要求', questions = after
    intro_end = q_content.find('作答要求')
    if intro_end < 0:
        intro_end = q_content.find('一、注意事项')
    intro = q_content[:intro_end].rstrip() if intro_end > 0 else ''

    # find question files for this paper in qq_dir
    stem = target_fn[:-3]   # "2010_安徽_A卷_真题" etc
    questions = []
    if os.path.isdir(qq_dir):
        q_files = sorted([f for f in os.listdir(qq_dir) if f.startswith(stem + '_q') and f.endswith('.md')])
        for qf in q_files:
            qfp = os.path.join(qq_dir, qf)
            with open(qfp, 'r', encoding='utf-8') as f:
                qfc = f.read()
            # parse qfm
            qfm = {}
            if qfc.startswith('---\n'):
                qend = qfc.find('\n---\n', 4)
                if qend > 0:
                    head = qfc[4:qend]
                    qbody = qfc[qend+5:].lstrip()
                    for ln in head.split('\n'):
                        m = re.match(r'^(\w+):\s*"?([^"\n]+)"?\s*$', ln.strip())
                        if m: qfm[m.group(1)] = m.group(2).strip()
            q_num = qfm.get('index_num', '0')
            qid = f"{paper_id}-q{q_num}"
            # body stem: remove frontmatter, remove '---' separator, remove leading intro duplication
            questions.append({
                'id': qid,
                'index': qfm.get('index', ''),
                'label': qfm.get('label', ''),
                'type': qfm.get('type', ''),
                'score': int(qfm.get('score', '0')) if qfm.get('score', '0').isdigit() else 0,
                'title': qfm.get('title', ''),
                'stem': qbody,
                'has_answer': True,
            })

    paper = {
        'id': paper_id,
        'title': target_fm.get('title', ''),
        'year': int(target_fm.get('year', '0')) if target_fm.get('year','').isdigit() else 0,
        'level': level,
        'province': target_fm.get('province', ''),
        'volume': target_fm.get('volume', ''),
        'is_joint': target_fm.get('is_joint', 'false').lower() == 'true',
        'tags': [],
        'question_count': len(questions),
        'has_answer': os.path.exists(os.path.join(a_dir, stem.replace('_真题', '_答案') + '.md')),
        'intro': intro,
        'questions': questions,
    }
    return json.dumps(paper, ensure_ascii=False)


def get_paper_answer(paper_id, qid):
    """Read 答案（拆题）/<stem>_q<n>.md body."""
    base = KNOWLEDGE_BASE
    parts = paper_id.split('-')
    level = parts[0]
    if level == 'guokao':
        a_dir = base + '/历年真题/答案（拆题）'
        q_dir = base + '/历年真题/试题'
    else:
        a_dir = base + '/各省联考/答案（拆题）'
        q_dir = base + '/各省联考/试题'

    # find the paper to get its stem
    year = parts[1] if len(parts) > 1 else ''
    rest = '-'.join(parts[2:])
    stem = None
    if os.path.isdir(q_dir):
        for fn in os.listdir(q_dir):
            if not fn.endswith('.md'): continue
            fp = os.path.join(q_dir, fn)
            try:
                with open(fp, 'r', encoding='utf-8') as f: head = f.read(2048)
            except: continue
            fm = {}
            for ln in head.split('\n'):
                if ln.strip() == '---':
                    if fm: break
                    continue
                m = re.match(r'^(\w+):\s*"?([^"\n]+)"?\s*$', ln.strip())
                if m: fm[m.group(1)] = m.group(2).strip()
            if fm.get('year') == year and f"{fm.get('province','')}-{fm.get('volume','')}".rstrip('-') == rest:
                stem = fn[:-3]
                break
            if not fn.endswith('.md'): continue
            fp = os.path.join(q_dir, fn)
            try:
                with open(fp, 'r', encoding='utf-8') as f: head = f.read(2048)
            except: continue
            fm = {}
            for ln in head.split('\n'):
                if ln.strip() == '---':
                    if fm: break
                    continue
                m = re.match(r'^(\w+):\s*"?([^"\n]+)"?\s*$', ln.strip())
                if m: fm[m.group(1)] = m.group(2).strip()
            if fm.get('year') == year and f"{fm.get('province','')}-{fm.get('volume','')}".rstrip('-') == rest:
                stem = fn[:-3]
                break
    if not stem:
        return json.dumps({'error': 'paper not found'}, ensure_ascii=False)

    # qid = paper_id-qN
    if not qid.startswith(paper_id + '-q'):
        return json.dumps({'error': 'bad qid'}, ensure_ascii=False)
    qnum = qid[len(paper_id)+2:]
    a_path = os.path.join(a_dir, f'{stem}_q{qnum}.md')
    if not os.path.exists(a_path):
        return json.dumps({'error': 'answer not found'}, ensure_ascii=False)
    with open(a_path, 'r', encoding='utf-8') as f:
        ac = f.read()
    body = ac
    if ac.startswith('---\n'):
        e = ac.find('\n---\n', 4)
        if e > 0: body = ac[e+5:].lstrip()
    # split analysis vs reference if '华图解析' / '参考答案' marker present
    analysis = ''
    answer = body
    for marker in ['华图解析', '中公解析', '答案要点', '参考答案']:
        idx = body.find(marker)
        if idx > 0:
            analysis = body[:idx].rstrip()
            answer = body[idx:].lstrip()
            # strip leading '参考答案：' if present
            answer = answer.lstrip('参考答案：').lstrip('参考作答：').lstrip()
            break
    return json.dumps({
        'id': qid,
        'question_id': qid,
        'paper_id': paper_id,
        'answer_text': answer,
        'analysis': analysis,
    }, ensure_ascii=False)
'''

DISPATCH = r'''
        elif path.startswith('/api/papers/') and path.endswith('/answer'):
            # /api/papers/{id}/answer/{qid}? — but we use /api/papers/{id}/answers/{qid}
            pass
        elif path.startswith('/api/papers/'):
            # /api/papers/{id} or /api/papers/{id}/answers/{qid}
            parts = path.split('/')
            # /api/papers/{id}/answers/{qid}
            if len(parts) >= 6 and parts[4] == 'answers':
                paper_id = parts[3]
                qid = parts[5]
                self._send(200, get_paper_answer(paper_id, qid), 'application/json')
            else:
                paper_id = parts[3]
                self._send(200, get_paper_detail(paper_id), 'application/json')
'''

with open(PATH, encoding='utf-8') as f:
    src = f.read()

if 'def get_paper_detail' in src:
    print('handler already present, skip')
else:
    needle = 'def get_papers_index():'
    if needle not in src:
        print('ERROR: papers handler not found')
        exit(1)
    src = src.replace(needle, DETAIL_HANDLER + '\n' + needle, 1)
    print('inserted detail handler')

if "path.startswith('/api/papers/')" in src:
    print('dispatch already present, skip')
else:
    needle = "elif path == '/api/papers':"
    if needle not in src:
        print('ERROR: papers dispatch anchor not found')
        exit(1)
    # find end of this elif block
    pos = src.find(needle)
    block_end = src.find('\n        elif ', pos + 1)
    if block_end < 0:
        block_end = src.find('\n        else:', pos + 1)
    src = src[:block_end] + DISPATCH + src[block_end:]
    print('inserted papers dispatch')

import os
backup = PATH + '.bak.' + str(int(os.path.getmtime(PATH)))
with open(backup, 'w', encoding='utf-8') as f: f.write(src)
with open(PATH, 'w', encoding='utf-8') as f: f.write(src)
print(f'Patched. backup: {backup}')
```

**Step 2：推 + 跑**

```bash
scp -P 2222 -i ~/.ssh/xuexi_tencent "C:/Users/hecto/ZCodeProject/patch_paper_detail.py" ubuntu@124.223.5.144:/tmp/patch_paper_detail.py
ssh -i ~/.ssh/xuexi_tencent -p 2222 ubuntu@124.223.5.144 "python3 /tmp/patch_paper_detail.py"
ssh -i ~/.ssh/xuexi_tencent -p 2222 ubuntu@124.223.5.144 "cd /opt/xuexi/09_选卡阅读 && python3 -c 'import py_compile; py_compile.compile(\"card_server.py\", doraise=True); print(\"ok\")'"
```

预期：`inserted detail handler` + `inserted papers dispatch` + `Patched.` + `ok`

**Step 3：重启服务**

```bash
ssh -i ~/.ssh/xuexi_tencent -p 2222 ubuntu@124.223.5.144 "pkill -9 -f card_server.py; sleep 1; cd /opt/xuexi/09_选卡阅读 && nohup python3 card_server.py > /tmp/card_server.log 2>&1 &"
sleep 2
curl -s "http://124.223.5.144/api/papers/guokao-2025-国考-副省级" | head -c 500
```

预期：`{"id": "guokao-2025-国考-副省级", ... "questions": [...]}` 200 OK

---

### Task 2.3：SSH 路径适配 - 服务端跑拆题脚本

**问题：** 服务端路径是 `/opt/xuexi/knowledge_base/06_真题库`，但你本机是 `E:/申论知识库/...`。要确保知识库同步到服务端。

**Step 1：在服务端创建同步目录**

```bash
ssh -i ~/.ssh/xuexi_tencent -p 2222 ubuntu@124.223.5.144 "mkdir -p /opt/xuexi/knowledge_base"
```

**Step 2：上传拆题脚本到服务端**

```bash
scp -P 2222 -i ~/.ssh/xuexi_tencent "C:/Users/hecto/ZCodeProject/split_questions.py" ubuntu@124.223.5.144:/opt/xuexi/knowledge_base/split_questions.py
```

**Step 3：修改服务端脚本路径**

(我们不需要真在服务端跑拆题；**只在本地跑**即可，因为产物全在 `E:/...`，服务端只需读 md)

所以这步跳过。服务端 `/opt/xuexi/knowledge_base/06_真题库` 暂时**不存在**，API 会失败。

**Step 4：建立挂载/同步**

让 API 能读本地知识库：
- 方案 A：用 Syncthing / rclone 把本地目录同步到服务端（要装工具）
- 方案 B：用 SSHFS 挂载（服务端装 sshfs，复杂）
- 方案 C：让服务端代码 base 改成 `/mnt/knowledge_base/06_真题库`，让你下次手动 mount 或 rsync
- 方案 D：先**只让 server 列出元信息 + 路径**（paper_id），客户端从 API 拿路径，**直接通过 HTTP 静态文件服务读 md**——需要服务端再加一个静态文件路由

**P0 简化：** 用方案 D - 服务端在 `/api/papers/{id}` 里把 `questions[].stem` 和 `answer_text` 都**内联**返回文本，**省去静态文件路由**。但这样响应会很大。

实际上方案 D 也意味着服务端要把 md 文件**实时读**——服务端必须能访问本地知识库。

最简办法：**scp 同步**。每次本地拆题后，scp 整个 `06_真题库` 到服务端。

**Step 5：scp 同步脚本**

```bash
"C:/Users/hecto/ZCodeProject/sync_knowledge.bat"（或 .sh）内容：
  rsync -av --delete -e "ssh -i ~/.ssh/xuexi_tencent -p 2222" \
    "E:/申论知识库/06_真题库/" \
    ubuntu@124.223.5.144:/opt/xuexi/knowledge_base/06_真题库/
```

**这步任务本身上传到 `sync_knowledge.sh`**：

```bash
cat > "C:/Users/hecto/ZCodeProject/sync_knowledge.sh" <<'EOF'
#!/usr/bin/env bash
# Sync local 06_真题库 to server for API serving.
# Usage: bash sync_knowledge.sh
set -e
LOCAL="/e/申论知识库/06_真题库/"
REMOTE="ubuntu@124.223.5.144"
DST="/opt/xuexi/knowledge_base/06_真题库/"
SSH_OPTS="-i ~/.ssh/xuexi_tencent -p 2222"

# rsync is preferred but may not be installed; fallback to scp.
if command -v rsync > /dev/null; then
    rsync -av --delete -e "ssh $SSH_OPTS" "$LOCAL" "$REMOTE:$DST"
else
    scp -r $SSH_OPTS "$LOCAL"* "$REMOTE:$DST"
fi
EOF
chmod +x "C:/Users/hecto/ZCodeProject/sync_knowledge.sh"
```

**Step 6：跑同步**

```bash
cd "C:/Users/hecto/ZCodeProject" && bash sync_knowledge.sh 2>&1 | tail -10
```

预期：~1500 文件同步完成

**Step 7：验证服务端能读**

```bash
ssh -i ~/.ssh/xuexi_tencent -p 2222 ubuntu@124.223.5.144 "ls /opt/xuexi/knowledge_base/06_真题库/历年真题/题目 | head -5"
curl -s "http://124.223.5.144/api/papers/guokao-2025-国考-副省级" | python3 -m json.tool | head -30
```

预期：服务端能看到题目文件，API 返回 200 + questions 数组

---

## Phase 3：客户端 - API Client

### Task 3.1：客户端 API

**Files:**
- Modify: `ShenlunApp/src/api/client.ts`

**Step 1：加新接口（追加在 `getArticlesByIds` 之后）**

```typescript
export interface Paper {
  id: string;
  title: string;
  year: number;
  level: 'guokao' | 'shengkao';
  province: string;
  volume: string;
  is_joint: boolean;
  tags: string[];
  question_count: number;
  has_answer: boolean;
}

export interface PaperQuestion {
  id: string;
  index: string;
  label: string;
  type: string;
  score: number;
  title: string;
  stem: string;
  has_answer: boolean;
}

export interface PaperDetail extends Paper {
  intro: string;
  questions: PaperQuestion[];
}

export interface PaperAnswer {
  id: string;
  question_id: string;
  paper_id: string;
  answer_text: string;
  analysis: string;
}

export async function getPapers(filter: {
  exam?: '' | 'guokao' | 'shengkao';
  year?: string;
  province?: string;
  volume?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{items: Paper[]; total: number; page: number; limit: number}> {
  try {
    const qs = new URLSearchParams();
    if (filter.exam) qs.set('exam', filter.exam);
    if (filter.year) qs.set('year', filter.year);
    if (filter.province) qs.set('province', filter.province);
    if (filter.volume) qs.set('volume', filter.volume);
    qs.set('page', String(filter.page ?? 1));
    qs.set('limit', String(filter.limit ?? 50));
    const url = `${BASE}/api/papers?${qs.toString()}`;
    const res = await fetch(url);
    if (!res.ok) return { items: [], total: 0, page: 1, limit: 50 };
    return await res.json();
  } catch {
    return { items: [], total: 0, page: 1, limit: 50 };
  }
}

export async function getPaperDetail(id: string): Promise<PaperDetail | null> {
  try {
    const res = await fetch(`${BASE}/api/papers/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getPaperAnswer(paperId: string, qid: string): Promise<PaperAnswer | null> {
  try {
    const res = await fetch(`${BASE}/api/papers/${encodeURIComponent(paperId)}/answers/${encodeURIComponent(qid)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
```

**Step 2：Type-check**

```bash
cd "C:/Users/hecto/ZCodeProject/ShenlunApp" && npx tsc --noEmit 2>&1 | head -10
```

预期：无输出

---

## Phase 4：客户端 - PaperScreen / PaperDetailScreen / QuestionScreen

### Task 4.1：PaperScreen 重写

**Files:**
- Modify: `ShenlunApp/src/screens/PaperScreen.tsx`

**Step 1：完整文件**

```tsx
// src/screens/PaperScreen.tsx
// V3 风格：真题列表，含筛选 + 加载
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { getPapers, type Paper } from '../api/client';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Paper'>;

const FILTERS: {key: 'all'|'guokao'|'shengkao'; label: string}[] = [
  { key: 'all', label: '全部' },
  { key: 'guokao', label: '国考' },
  { key: 'shengkao', label: '省考' },
];

export default function PaperScreen() {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation<Nav>();
  const [exam, setExam] = useState<'all'|'guokao'|'shengkao'>('all');
  const [items, setItems] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getPapers({ exam: exam === 'all' ? '' : exam, limit: 100 });
    setItems(r.items);
    setTotal(r.total);
    setLoading(false);
  }, [exam]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      {/* Filter row */}
      <View style={[styles.filterRow, { borderBottomColor: t.divider }]}>
        {FILTERS.map(f => {
          const active = f.key === exam;
          return (
            <Pressable key={f.key} onPress={() => setExam(f.key)} style={styles.filterBtn} hitSlop={4}>
              <Text style={[
                styles.filterLbl,
                { color: active ? t.seal : t.inkSoft,
                  borderBottomWidth: active ? 3 : 1.5,
                  borderBottomColor: active ? t.seal : t.divider,
                  fontFamily: active ? fonts.kai.bold : fonts.kai.regular,
                }
              ]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
        <Text style={[styles.count, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          共 {total} 卷
        </Text>
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={t.brass} /></View>
      ) : items.length === 0 ? (
        <View style={styles.loading}>
          <Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            暂无试卷数据
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={p => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => nav.navigate('PaperDetail', { id: item.id })}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: t.paper, borderColor: t.border },
                pressed && { opacity: 0.85 },
              ]}
              android_ripple={{ color: `${t.brass}22` }}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
              <View style={styles.cardMeta}>
                <Text style={[styles.metaText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
                  {item.year} | {item.level === 'guokao' ? '国考' : item.province} | {item.volume || '通用'} | {item.question_count} 题
                </Text>
              </View>
              {item.has_answer && (
                <View style={[styles.answerBadge, { backgroundColor: t.brass }]}>
                  <Text style={[styles.answerBadgeText, { color: t.paper, fontFamily: fonts.kai.bold }]}>
                    有答案
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, gap: spacing.xl,
    borderBottomWidth: borders.hair,
  },
  filterBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  filterLbl: { fontSize: 16, letterSpacing: 4, lineHeight: 22, paddingBottom: 6 },
  count: { marginLeft: 'auto', fontSize: 11, letterSpacing: 2 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { fontSize: fontSizes.body, letterSpacing: 3 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  card: { padding: spacing.md, borderWidth: borders.hair, borderRadius: radii.md, marginBottom: spacing.sm, position: 'relative' },
  cardHeader: { marginBottom: 6 },
  cardTitle: { fontSize: fontSizes.body, lineHeight: 22 },
  cardMeta: { marginTop: 2 },
  metaText: { fontSize: 11, letterSpacing: 2 },
  answerBadge: {
    position: 'absolute', top: 6, right: 6,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  answerBadgeText: { fontSize: 9, letterSpacing: 1 },
});
```

**Step 2：type-check**

```bash
cd "C:/Users/hecto/ZCodeProject/ShenlunApp" && npx tsc --noEmit 2>&1 | head -20
```

预期：无输出

---

### Task 4.2：PaperDetailScreen

**Files:**
- Create: `ShenlunApp/src/screens/PaperDetailScreen.tsx`

**Step 1：完整文件**

```tsx
// src/screens/PaperDetailScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii } from '../theme/tokens';
import { getPaperDetail, type PaperDetail } from '../api/client';
import { Divider } from '../components/Divider';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'PaperDetail'>;

export default function PaperDetailScreen({ route }: Props) {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation();
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await getPaperDetail(route.params.id);
      if (cancelled) return;
      setPaper(d);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [route.params.id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={styles.loading}><ActivityIndicator color={t.brass} /></View>
      </SafeAreaView>
    );
  }

  if (!paper) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <Pressable onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={[styles.back, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <View style={styles.loading}>
          <Text style={[styles.empty, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            未找到此试卷
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={8}>
          <Text style={[styles.back, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]} numberOfLines={1}>
          {paper.year} {paper.province} {paper.volume}
        </Text>
        <Text style={[styles.counter, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
          {paper.questions.length} 题
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {paper.intro ? (
          <View style={[styles.section, { backgroundColor: t.paper, borderColor: t.border }]}>
            <Text style={[styles.sectionLabel, { color: t.seal, fontFamily: fonts.kai.bold }]}>材料</Text>
            <Text style={[styles.introText, { color: t.inkSoft, fontFamily: fonts.serif.regular }]}>
              {paper.intro}
            </Text>
          </View>
        ) : null}

        <Divider withCenter />

        <Text style={[styles.sectionLabel, { color: t.seal, fontFamily: fonts.kai.bold }]}>题目</Text>
        {paper.questions.map(q => (
          <Pressable
            key={q.id}
            onPress={() => nav.navigate('Question', { paperId: paper.id, qid: q.id })}
            style={({ pressed }) => [
              styles.qRow,
              { backgroundColor: t.paper, borderColor: t.border },
              pressed && { opacity: 0.85 },
            ]}
            android_ripple={{ color: `${t.brass}22` }}
          >
            <View style={styles.qHead}>
              <Text style={[styles.qLabel, { color: t.ink, fontFamily: fonts.serif.bold }]}>
                {q.label}
              </Text>
              {q.type ? (
                <View style={[styles.qTypeBadge, { borderColor: t.brass }]}>
                  <Text style={[styles.qTypeText, { color: t.brassDeep, fontFamily: fonts.kai.regular }]}>
                    {q.type}
                  </Text>
                </View>
              ) : null}
              {q.score ? (
                <Text style={[styles.qScore, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
                  {q.score} 分
                </Text>
              ) : null}
            </View>
            <Text style={[styles.qTitle, { color: t.inkSoft, fontFamily: fonts.serif.regular }]} numberOfLines={2}>
              {q.title || q.stem.slice(0, 80)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { fontSize: fontSizes.body },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: borders.hair,
  },
  title: { flex: 1, fontSize: fontSizes.subtitle, letterSpacing: 3, textAlign: 'center' },
  counter: { fontSize: fontSizes.caption, letterSpacing: 2 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  section: { padding: spacing.md, borderWidth: borders.hair, borderRadius: radii.md, marginBottom: spacing.md },
  sectionLabel: { fontSize: fontSizes.body, letterSpacing: 4, marginBottom: spacing.sm },
  introText: { fontSize: fontSizes.body, lineHeight: 22 },
  qRow: { padding: spacing.md, borderWidth: borders.hair, borderRadius: radii.md, marginBottom: spacing.sm },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  qLabel: { fontSize: fontSizes.body, letterSpacing: 2 },
  qTypeBadge: { paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderRadius: 2 },
  qTypeText: { fontSize: 10, letterSpacing: 1 },
  qScore: { marginLeft: 'auto', fontSize: 11, letterSpacing: 1 },
  qTitle: { fontSize: fontSizes.body, lineHeight: 20 },
  empty: { fontSize: fontSizes.body, letterSpacing: 3 },
});
```

**Step 2：type-check**

```bash
cd "C:/Users/hecto/ZCodeProject/ShenlunApp" && npx tsc --noEmit 2>&1 | head -10
```

预期：无输出

---

### Task 4.3：QuestionScreen

**Files:**
- Create: `ShenlunApp/src/screens/QuestionScreen.tsx`

**Step 1：完整文件**

```tsx
// src/screens/QuestionScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { fonts, fontSizes, spacing, borders, radii, lineHeights } from '../theme/tokens';
import { getPaperDetail, getPaperAnswer, type PaperDetail } from '../api/client';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Question'>;

export default function QuestionScreen({ route }: Props) {
  const { theme } = useTheme();
  const t = theme.tokens;
  const nav = useNavigation();
  const { paperId, qid } = route.params;
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [answer, setAnswer] = useState<{ answer_text: string; analysis: string } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [d, a] = await Promise.all([getPaperDetail(paperId), getPaperAnswer(paperId, qid)]);
      if (cancelled) return;
      setPaper(d);
      setAnswer(a);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [paperId, qid]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
        <View style={styles.loading}><ActivityIndicator color={t.brass} /></View>
      </SafeAreaView>
    );
  }

  const q = paper?.questions.find(x => x.id === qid);

  // 找下一题 ID
  const nextQid = paper ? (() => {
    const idx = paper.questions.findIndex(x => x.id === qid);
    return paper.questions[idx + 1]?.id;
  })() : undefined;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: t.divider }]}>
        <Pressable onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={8}>
          <Text style={[styles.back, { color: t.ink }]}>← 返回</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink, fontFamily: fonts.serif.bold }]}>
          {q?.label ?? '题目'}
        </Text>
        {q?.score ? (
          <Text style={[styles.score, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>
            {q.score} 分
          </Text>
        ) : <View style={styles.score} />}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 题型/分值 chips */}
        <View style={styles.chipRow}>
          {q?.type ? (
            <View style={[styles.chip, { borderColor: t.brass }]}>
              <Text style={[styles.chipText, { color: t.brassDeep, fontFamily: fonts.kai.regular }]}>{q.type}</Text>
            </View>
          ) : null}
          {q?.index ? (
            <View style={[styles.chip, { borderColor: t.divider }]}>
              <Text style={[styles.chipText, { color: t.inkMuted, fontFamily: fonts.kai.regular }]}>{q.index}</Text>
            </View>
          ) : null}
        </View>

        {/* 题干 */}
        <Text style={[styles.stem, { color: t.ink, fontFamily: fonts.serif.regular }]}>
          {q?.stem || '题目未找到'}
        </Text>

        {/* 答案 toggle */}
        <Pressable
          onPress={() => setShowAnswer(s => !s)}
          style={({ pressed }) => [
            styles.answerToggle,
            { backgroundColor: t.seal },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={[styles.answerToggleText, { color: t.paper, fontFamily: fonts.kai.bold }]}>
            {showAnswer ? '收起答案' : '查看答案'}
          </Text>
        </Pressable>

        {showAnswer && answer && (
          <View style={styles.answerSection}>
            {answer.analysis ? (
              <View style={[styles.answerBlock, { backgroundColor: t.bgAlt }]}>
                <Text style={[styles.answerLabel, { color: t.brassDeep, fontFamily: fonts.kai.bold }]}>
                  解 析
                </Text>
                <Text style={[styles.answerText, { color: t.inkSoft, fontFamily: fonts.serif.regular }]}>
                  {answer.analysis}
                </Text>
              </View>
            ) : null}
            <View style={[styles.answerBlock, { backgroundColor: t.paper, borderColor: t.border, borderWidth: borders.hair }]}>
              <Text style={[styles.answerLabel, { color: t.seal, fontFamily: fonts.kai.bold }]}>
                参 考 答 案
              </Text>
              <Text style={[styles.answerText, { color: t.ink, fontFamily: fonts.serif.regular }]}>
                {answer.answer_text}
              </Text>
            </View>
          </View>
        )}

        {/* 底部：下一题 */}
        {nextQid ? (
          <Pressable
            onPress={() => nav.replace('Question', { paperId, qid: nextQid })}
            style={({ pressed }) => [
              styles.nextBtn,
              { backgroundColor: t.brass },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.nextBtnText, { color: t.paper, fontFamily: fonts.kai.bold }]}>
              下一题 ›
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => nav.goBack()}
            style={({ pressed }) => [
              styles.nextBtn,
              { backgroundColor: t.inkMuted },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.nextBtnText, { color: t.paper, fontFamily: fonts.kai.bold }]}>
              返回试卷
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { fontSize: fontSizes.body },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: borders.hair,
  },
  title: { flex: 1, fontSize: fontSizes.subtitle, letterSpacing: 3, textAlign: 'center' },
  score: { width: 60, textAlign: 'right', fontSize: fontSizes.caption, letterSpacing: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  chipRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.md },
  chip: { paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderRadius: 2 },
  chipText: { fontSize: 11, letterSpacing: 1 },
  stem: { fontSize: fontSizes.bodyLg, lineHeight: fontSizes.bodyLg * lineHeights.prose, marginBottom: spacing.lg },
  answerToggle: { paddingVertical: spacing.md, borderRadius: radii.sm, alignItems: 'center', marginBottom: spacing.md },
  answerToggleText: { fontSize: fontSizes.body, letterSpacing: 4 },
  answerSection: { marginBottom: spacing.lg },
  answerBlock: { padding: spacing.md, borderRadius: radii.sm, marginBottom: spacing.sm },
  answerLabel: { fontSize: fontSizes.body, letterSpacing: 3, marginBottom: spacing.xs },
  answerText: { fontSize: fontSizes.body, lineHeight: 22 },
  nextBtn: { paddingVertical: spacing.md, borderRadius: radii.sm, alignItems: 'center' },
  nextBtnText: { fontSize: fontSizes.body, letterSpacing: 4 },
});
```

**Step 2：type-check**

```bash
cd "C:/Users/hecto/ZCodeProject/ShenlunApp" && npx tsc --noEmit 2>&1 | head -10
```

预期：无输出

---

### Task 4.4：App.tsx 加新路由

**Files:**
- Modify: `ShenlunApp/src/App.tsx`

**Step 1：扩 RootStackParamList**

```typescript
export type RootStackParamList = {
  Main: undefined;
  Review: undefined;
  Reader: { id: string };
  Gold: undefined;
  PaperDetail: { id: string };
  Question: { paperId: string; qid: string };
};
```

**Step 2：加 imports + Stack.Screen**

```tsx
import PaperDetailScreen from './screens/PaperDetailScreen';
import QuestionScreen from './screens/QuestionScreen';
...
<Stack.Screen name="PaperDetail" component={PaperDetailScreen} />
<Stack.Screen name="Question" component={QuestionScreen} />
```

**Step 3：type-check**

```bash
cd "C:/Users/hecto/ZCodeProject/ShenlunApp" && npx tsc --noEmit 2>&1 | head -10
```

预期：无输出

---

## Phase 5：编译验证

### Task 5.1：APK 重打

**Files:**
- 无新文件

**Step 1：Gradle build**

```bash
cd "C:/Users/hecto/ZCodeProject/ShenlunApp/android" && JAVA_HOME="C:\Users\hecto\jdk17\jdk-17.0.19+10" ./gradlew.bat assembleDebug -x lint --no-daemon 2>&1 | tail -8
```

预期：`BUILD SUCCESSFUL`

**Step 2：拷贝 APK**

```bash
cp "C:/Users/hecto/ZCodeProject/ShenlunApp/android/app/build/outputs/apk/debug/app-debug.apk" "C:/Users/hecto/ZCodeProject/app-debug.apk"
ls -la "C:/Users/hecto/ZCodeProject/app-debug.apk"
```

预期：~148 MB

**Step 3：spot-check 主菜单接入**

- 启动 App
- 切到"题目"Tab
- 应看到国考 / 省考筛选 + 试卷列表
- 点试卷 → 详情页含材料 + 题目
- 点题 → 题干 + 查看答案 + 下一题

---

## 验收清单

- [ ] `E:/申论知识库/06_真题库/历年真题/题目/` 含 ~200 个文件
- [ ] `E:/申论知识库/06_真题库/各省联考/题目/` 含 ~2700 个文件
- [ ] 服务端 `/api/papers` 返回 ≥600 个 items
- [ ] 服务端 `/api/papers/guokao-2025-国考-副省级` 返回 detail 含 ≥3 道题
- [ ] PaperScreen 显示列表 + 筛选
- [ ] PaperDetailScreen 显示材料 + 题目
- [ ] QuestionScreen 显示题干 + 答案 + 下一题
- [ ] APK 重打成功

## 风险

- 拆题边界识别不准确 → fallback 整卷当 1 题
- 服务端路径 `/opt/xuexi/knowledge_base` 需手动同步（task 2.3 Step 6 同步脚本）
- 题型识别粗略 → 留 "type: ''" 字段供后续 AI 修订
- 服务端缓存：实现里没加缓存层（5 分钟缓存），每次请求实时扫盘
- 字体 bbox 警告：pdfplumber 噪音，可忽略
- SSH 同步大目录可能慢（1500 文件 + ssh 加密）—— P0 接受，初次 ~1-2 分钟

## 后续（P1+）

- AI 一次性填充 tags
- 用户作答记录 + 计时
- 单题级搜索（按题干关键词）
- 历年主题分布图
- 阅卷评分