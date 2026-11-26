import { createServer, createConnection } from 'node:net';
import { once } from 'node:events';

/** 解析 RESP2 帧边界与数组值；未完成的分块返回 undefined，不改写真实 Redis 成功响应。 */
export function readResp(buffer, offset = 0) {
  const end = buffer.indexOf('\r\n', offset);
  if (end < 0) return;
  const type = String.fromCharCode(buffer[offset]),
    value = buffer.toString('utf8', offset + 1, end);
  if (type === '$') {
    const size = Number(value);
    if (size === -1) return { next: end + 2, value: null };
    if (buffer.length < end + 2 + size + 2) return;
    return { next: end + 2 + size + 2, value: buffer.toString('utf8', end + 2, end + 2 + size) };
  }
  if (type === '*') {
    let next = end + 2;
    const values = [];
    for (let index = 0; index < Number(value); index++) {
      const part = readResp(buffer, next);
      if (!part) return;
      values.push(part.value);
      next = part.next;
    }
    return { next, value: values };
  }
  return { next: end + 2, value: type === ':' ? Number(value) : value };
}

/** 私有测试 Redis 的透明命令代理：仅观察 MGET 或定向拒绝它；不记录 AUTH/业务值。 */
export async function createRedisProxy({ host = '127.0.0.1', port = 0, upstream }) {
  const target = new URL(upstream),
    sockets = new Set(),
    observations = [];
  let rule;
  const server = createServer((socket) => {
    const remote = createConnection({ host: target.hostname, port: Number(target.port || 6379) });
    sockets.add(socket);
    sockets.add(remote);
    let pending = Buffer.alloc(0),
      replies = Buffer.alloc(0),
      waiting = [];
    // 故障响应也按 Redis 回复顺序提交，不能与前一条 AUTH/INFO 的成功回复错位。
    const flush = () => {
      while (waiting[0]?.reply) socket.write(waiting.shift().reply);
    };
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (true) {
        const frame = readResp(pending);
        if (!frame) break;
        const bytes = pending.subarray(0, frame.next);
        pending = pending.subarray(frame.next);
        const command = String(frame.value?.[0]).toUpperCase(),
          keys = command === 'MGET' ? frame.value.slice(1) : [];
        const fail =
          rule?.command === command &&
          keys.some((key) => key.includes(rule.keyIncludes)) &&
          rule.remaining > 0;
        if (command === 'MGET')
          observations.push({
            sequence: observations.length,
            at: Date.now(),
            command,
            keys,
            failed: Boolean(fail)
          });
        const entry = {
          forwarded: !fail,
          reply: fail ? Buffer.from('-ERR FGTEST controlled MGET failure\r\n') : undefined
        };
        waiting.push(entry);
        if (fail) {
          rule.remaining--;
          flush();
        } else remote.write(bytes);
      }
    });
    remote.on('data', (chunk) => {
      replies = Buffer.concat([replies, chunk]);
      while (true) {
        const frame = readResp(replies);
        if (!frame) break;
        const entry = waiting.find((item) => item.forwarded && !item.reply);
        if (!entry) {
          socket.destroy(new Error('Unmatched Redis response'));
          break;
        }
        entry.reply = replies.subarray(0, frame.next);
        replies = replies.subarray(frame.next);
        flush();
      }
    });
    for (const [first, second] of [
      [socket, remote],
      [remote, socket]
    ]) {
      first.on('error', () => second.destroy());
      first.on('close', () => {
        sockets.delete(first);
        second.destroy();
      });
    }
  });
  server.listen(port, host);
  await once(server, 'listening');
  return {
    url: `redis://${host}:${server.address().port}`,
    observations,
    setRule(value) {
      rule = value;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}
