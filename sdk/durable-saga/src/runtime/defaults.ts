import { SagaDefinitionError, SagaExecutionLostError } from '../core/error';
import type {
  ExecutionLease,
  LeaseProvider,
  SagaClock,
  SagaIdGenerator,
  SagaValueHasher
} from './ports';

const canonicalSerialize = (value: unknown): string => {
  const ancestors = new Set<object>();

  const visit = (current: unknown): string => {
    if (current === null) return '["null"]';
    if (typeof current === 'string') return `["string",${JSON.stringify(current)}]`;
    if (typeof current === 'boolean') return `["boolean",${current ? 'true' : 'false'}]`;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) {
        throw new SagaDefinitionError('Saga input cannot contain non-finite numbers');
      }
      return `["number",${Object.is(current, -0) ? '0' : String(current)}]`;
    }
    if (typeof current === 'bigint') return `["bigint",${JSON.stringify(current.toString())}]`;
    if (current instanceof Date) return `["date",${JSON.stringify(current.toISOString())}]`;
    if (Array.isArray(current)) {
      if (ancestors.has(current)) throw new SagaDefinitionError('Saga input cannot contain cycles');
      ancestors.add(current);
      const result = `["array",[${current.map(visit).join(',')}]]`;
      ancestors.delete(current);
      return result;
    }
    if (typeof current === 'object') {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new SagaDefinitionError('Saga input can only contain plain objects and Date values');
      }
      if (ancestors.has(current)) throw new SagaDefinitionError('Saga input cannot contain cycles');
      ancestors.add(current);
      const record = current as Record<string, unknown>;
      const result = `["object",[${Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `[${JSON.stringify(key)},${visit(record[key])}]`)
        .join(',')}]]`;
      ancestors.delete(current);
      return result;
    }

    throw new SagaDefinitionError(`Saga input contains unsupported value type "${typeof current}"`);
  };

  return visit(value);
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');

export const defaultSagaValueHasher: SagaValueHasher = {
  async hash(value) {
    const bytes = new TextEncoder().encode(canonicalSerialize(value));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return toHex(new Uint8Array(digest));
  }
};

export const systemSagaClock: SagaClock = {
  now: () => new Date(),
  sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }

      const timeout = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(signal.reason);
        },
        { once: true }
      );
    });
  }
};

export const systemSagaIdGenerator: SagaIdGenerator = {
  nextId: () => globalThis.crypto.randomUUID()
};

const passiveLease: ExecutionLease = {
  signal: new AbortController().signal,
  async assertValid() {}
};

export const passiveLeaseProvider: LeaseProvider = {
  async withLeases(_keys, run) {
    return run(passiveLease);
  }
};

export const assertLeaseSignal = (sagaId: string, lease: ExecutionLease): void => {
  if (lease.signal.aborted) {
    throw new SagaExecutionLostError(sagaId);
  }
};
