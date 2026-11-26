import assert from 'node:assert/strict';

/** 增量读取真实 SSE，保留文本 phase、ID、注释与原 data；取消只关闭本连接。 */
export function openEventStream(response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let cancelled = false,
    ended = false,
    failure;
  const finished = (async () => {
    let buffer = '',
      event = 'message',
      data = [],
      id;
    function line(value) {
      if (value === '') {
        if (data.length) {
          const raw = data.join('\n');
          const parsed = (() => {
            try {
              return JSON.parse(raw);
            } catch {
              return raw;
            }
          })();
          events.push({
            event,
            data: parsed,
            raw,
            ...(id === undefined ? {} : { id }),
            at: Date.now()
          });
        }
        event = 'message';
        data = [];
        return;
      }
      if (value.startsWith(':')) {
        events.push({ event: 'comment', data: value.slice(1).replace(/^ /, ''), at: Date.now() });
        return;
      }
      const colon = value.indexOf(':');
      const field = colon < 0 ? value : value.slice(0, colon);
      const content = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
      if (field === 'data') data.push(content);
      if (field === 'event') event = content;
      if (field === 'id' && !content.includes('\0')) id = content;
    }
    try {
      while (true) {
        const part = await reader.read();
        buffer += decoder.decode(part.value, { stream: !part.done });
        while (true) {
          const index = buffer.search(/[\r\n]/);
          if (index < 0 || (!part.done && index === buffer.length - 1 && buffer[index] === '\r'))
            break;
          const width = buffer.slice(index, index + 2) === '\r\n' ? 2 : 1;
          line(buffer.slice(0, index));
          buffer = buffer.slice(index + width);
        }
        if (part.done) break;
      }
      // 没有空行分隔的尾部不视为已提交事件，符合 SSE 协议。
    } catch (error) {
      failure = error;
    } finally {
      ended = true;
      reader.releaseLock();
    }
    return {
      cancelled,
      done: events.some((item) => item.data === '[DONE]'),
      ...(failure && !cancelled ? { error: failure.message } : {})
    };
  })();
  return {
    events,
    finished,
    text: () =>
      events
        .flatMap((item) => item.data?.choices ?? [])
        .map((choice) => choice.delta?.content ?? '')
        .join(''),
    async wait(predicate, timeout = 30000) {
      const deadline = Date.now() + timeout;
      while (true) {
        const value = events.find(predicate);
        if (value) return value;
        if (ended || Date.now() >= deadline)
          throw new Error(
            'SSE 未到达所需事件：' + (failure?.message ?? (ended ? '连接结束' : '超时'))
          );
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
    async cancel() {
      cancelled = true;
      if (!ended) await reader.cancel().catch(() => {});
      await finished;
    }
  };
}
