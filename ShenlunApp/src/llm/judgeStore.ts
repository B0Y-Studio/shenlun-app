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
