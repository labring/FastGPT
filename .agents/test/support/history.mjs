import assert from 'node:assert/strict';
import { poll } from './scenario.mjs';

/** 只读 React Context 调试快照，不写组件状态；同时保存 UI 不直接展示的时间与已读字段。 */
export async function historySnapshot(page) {
  return page.evaluate(() => {
    const element =
      document.querySelector('.chatHistoryItem') ??
      document.querySelector('textarea') ??
      document.querySelector('#__next button');
    if (!element) throw Error('对话页面尚未就绪');
    const key = Object.keys(element).find((key) => key.startsWith('__reactFiber$'));
    function inspect(value, { depth, seen = new Set() }) {
      if (!value || typeof value !== 'object' || depth < 0 || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value.histories) && typeof value.onChangeAppId === 'function')
        return value.histories;
      for (const name of Reflect.ownKeys(value)) {
        if (['children', '_owner', '_context', 'currentTarget'].includes(name)) continue;
        const found = inspect(value[name], { depth: depth - 1, seen });
        if (found) return found;
      }
    }
    for (let fiber = element[key], depth = 0; fiber && depth < 100; fiber = fiber.return, depth++) {
      const list = inspect(fiber.memoizedProps?.value, { depth: 7 });
      if (list)
        return list.map((row) => ({
          chatId: row.chatId,
          appId: row.appId,
          skillId: row.skillId,
          title: row.title,
          customTitle: row.customTitle,
          top: row.top ?? false,
          updateTime: new Date(row.updateTime).toISOString(),
          hasBeenRead: row.hasBeenRead,
          chatGenerateStatus: row.chatGenerateStatus
        }));
    }
    throw Error('未找到可只读检查的 ChatContext；不能用后台数据冒充页面状态');
  });
}

/** 通过实际滚动分页加载历史，比较唯一 ID 数；不直接调用产品分批函数替代页面行为。 */
export async function loadHistory(page, count) {
  await poll(async () => assert.ok((await page.locator('.chatHistoryItem').count()) > 0), 60000);
  for (let attempt = 0; attempt < 35; attempt++) {
    const snapshot = await historySnapshot(page);
    if (new Set(snapshot.map((row) => row.chatId)).size >= count) return snapshot;
    await page
      .locator('.chatHistoryItem')
      .last()
      .evaluate((element) => {
        for (let current = element.parentElement; current; current = current.parentElement) {
          if (
            current.scrollHeight > current.clientHeight + 5 &&
            ['auto', 'scroll', 'overlay'].includes(getComputedStyle(current).overflowY)
          ) {
            current.scrollTop = current.scrollHeight;
            return;
          }
        }
        element.scrollIntoView({ block: 'end' });
      });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw Error('真实页面未加载足够历史');
}

/** 记录浏览器真实状态请求时间线，可与私有 Redis 命令记录交叉核验。 */
export function historyNetwork(page, c) {
  const calls = [];
  page.on('request', (request) => {
    if (!request.url().includes('/api/core/chat/history/getHistoryStatus')) return;
    const call = { at: Date.now(), body: request.postDataJSON(), ended: false };
    calls.push(call);
    const end = async (event) => {
      if (event !== request) return;
      call.ended = true;
      call.endAt = Date.now();
      c.record('页面状态请求', call);
      page.off('requestfinished', end);
      page.off('requestfailed', end);
    };
    page.on('requestfinished', end);
    page.on('requestfailed', end);
  });
  return calls;
}
