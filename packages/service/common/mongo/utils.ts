import { ReadPreference } from './index';

export const readFromSecondary = {
  readPreference: ReadPreference.SECONDARY_PREFERRED, // primary | primaryPreferred | secondary | secondaryPreferred | nearest
  readConcern: {
    level: 'local' as any
  } // local | majority | linearizable | available
};

export const writePrimary = {
  writeConcern: {
    w: 1,
    journal: false
  }
};

/** 逐条读取游标，下载取消时主动关闭底层查询。 */
export async function* iterateCursor<T>(
  cursor: AsyncIterable<T> & { close: () => Promise<void> },
  signal: AbortSignal
): AsyncGenerator<T> {
  const close = () => cursor.close().catch(() => undefined);
  const onAbort = () => void close();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    signal.throwIfAborted();
    for await (const doc of cursor) {
      signal.throwIfAborted();
      yield doc;
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    await close();
  }
}
