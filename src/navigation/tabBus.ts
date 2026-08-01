// src/navigation/tabBus.ts
// 极简的全局 Tab 控制总线：让 Main 屏外的内容屏（比如 HomeScreen / ReviewScreen）
// 能切换外层 activeKey，并把过滤项（filter）传给 SourceScreen 等目标。
type Filter = Record<string, any>;
type Payload = { filter?: Filter };
type Listener = (key: string, payload?: Payload) => void;

let currentListener: Listener | null = null;

export const tabBus = {
  /** 在 RootNavigator 挂载时调用，把自己注册进去；返回反注册函数。 */
  bind(listener: Listener): () => void {
    currentListener = listener;
    return () => { currentListener = null; };
  },
  /** 在任何子屏中调用，请求切换到某个 Tab key，可附带过滤项。 */
  set(key: string, payload?: Payload): void {
    currentListener?.(key, payload);
  },
};
