// src/config/dataMode.ts
// 数据源模式开关（独立模式 ⇄ 服务器模式），MMKV 持久化。
// 复用 ThemeContext 的"读一次 + setter 写回"模式（无 Context，因为
// client.ts 等非组件模块也要同步读）。
//
// 默认 'local'：服务器到期后 App 开箱即用；新服务器就绪后在
// 设置页切回 'server'（网络代码在 client.ts 原样保留）。

import { getStorage } from '../storage/mmkv';

export type DataMode = 'local' | 'server';

const KEY = 'data_mode';

export function getDataMode(): DataMode {
  const v = getStorage()?.getString(KEY);
  return v === 'server' ? 'server' : 'local';
}

export function isLocalMode(): boolean {
  return getDataMode() === 'local';
}

export function setDataMode(mode: DataMode): void {
  getStorage()?.set(KEY, mode);
}
