import { randomUUID } from 'crypto';

const flushId = randomUUID();
export function getFlushId() {
  return flushId;
}
