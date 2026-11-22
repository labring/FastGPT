/**
 * Tiny RESP2 client used only by the E2E driver to seed a login session and to
 * clear MCP OAuth rate-limit counters between cases.
 *
 * Deliberately dependency-free: the repo does not hoist `ioredis` next to this
 * script, and the test must not rely on pnpm's internal `.pnpm` layout.
 */
import net from 'node:net';

const CRLF = Buffer.from('\r\n');

const encodeCommand = (args) => {
  const parts = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const value = Buffer.from(String(arg));
    parts.push(Buffer.from(`$${value.length}\r\n`), value, CRLF);
  }
  return Buffer.concat(parts);
};

/** Returns `{ value, offset }` once a complete reply is buffered, else null. */
const parseReply = (buffer, offset = 0) => {
  if (offset >= buffer.length) return null;
  const lineEnd = buffer.indexOf('\r\n', offset);
  if (lineEnd === -1) return null;
  const marker = String.fromCharCode(buffer[offset]);
  const line = buffer.toString('utf8', offset + 1, lineEnd);
  const next = lineEnd + 2;

  if (marker === '+') return { value: line, offset: next };
  if (marker === '-') return { value: new Error(line), offset: next };
  if (marker === ':') return { value: Number(line), offset: next };
  if (marker === '$') {
    const length = Number(line);
    if (length === -1) return { value: null, offset: next };
    if (buffer.length < next + length + 2) return null;
    return {
      value: buffer.toString('utf8', next, next + length),
      offset: next + length + 2
    };
  }
  if (marker === '*') {
    const count = Number(line);
    if (count === -1) return { value: null, offset: next };
    const items = [];
    let cursor = next;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseReply(buffer, cursor);
      if (!parsed) return null;
      if (parsed.value instanceof Error) return { value: parsed.value, offset: parsed.offset };
      items.push(parsed.value);
      cursor = parsed.offset;
    }
    return { value: items, offset: cursor };
  }
  return { value: new Error(`Unsupported RESP reply: ${marker}`), offset: next };
};

export const createRespClient = (redisUrl) => {
  const url = new URL(redisUrl);
  const socket = net.createConnection({
    host: url.hostname,
    port: Number(url.port || 6379)
  });
  socket.setNoDelay(true);

  let buffer = Buffer.alloc(0);
  const pending = [];
  let closedError;

  const flush = () => {
    while (pending.length > 0) {
      const parsed = parseReply(buffer);
      if (!parsed) return;
      buffer = buffer.subarray(parsed.offset);
      const waiter = pending.shift();
      if (parsed.value instanceof Error) waiter.reject(parsed.value);
      else waiter.resolve(parsed.value);
    }
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });
  socket.on('error', (error) => {
    closedError = error;
    while (pending.length > 0) pending.shift().reject(error);
  });
  socket.on('close', () => {
    const error = closedError ?? new Error('Redis connection closed');
    while (pending.length > 0) pending.shift().reject(error);
  });

  const command = (...args) =>
    new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
      socket.write(encodeCommand(args));
    });

  return {
    command,
    async scanDelete(pattern) {
      let cursor = '0';
      do {
        const [next, keys] = await command('SCAN', cursor, 'MATCH', pattern, 'COUNT', '500');
        cursor = String(next);
        if (keys.length > 0) await command('DEL', ...keys);
      } while (cursor !== '0');
    },
    close() {
      socket.end();
      socket.destroy();
    }
  };
};
