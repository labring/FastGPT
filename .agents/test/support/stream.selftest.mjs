import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

test('真实未结束 SSE 可增量读到文本 phase、事件 ID、中文和 ping，取消连接后不等待 DONE', async () => {
  const { openEventStream } = await import('./stream.mjs');
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const bytes = Buffer.from(
      ': ping\r\nid: 10-0\r\nevent: resumePhase\r\ndata: catchup\r\n\r\nevent: answer\ndata: {"choices":[{"delta":{"content":"中文"}}]}\n\n'
    );
    for (const byte of bytes) res.write(Buffer.of(byte));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const stream = openEventStream(await fetch(`http://127.0.0.1:${server.address().port}`));
    await stream.wait((event) => event.event === 'answer');
    assert.equal(stream.events.find((event) => event.event === 'resumePhase').data, 'catchup');
    assert.equal(stream.events.find((event) => event.event === 'resumePhase').id, '10-0');
    assert.equal(stream.events.find((event) => event.event === 'comment').data, 'ping');
    assert.equal(stream.text(), '中文');
    await stream.cancel();
    const end = await stream.finished;
    assert.equal(end.cancelled, true);
    assert.equal(end.done, false);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
