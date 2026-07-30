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
