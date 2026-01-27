import { type AsyncSink } from '@logtape/logtape';
import { getMongoLog } from '../system/log/schema';

function sanitize(value: unknown, seen = new WeakSet(), depth = 0, maxDepth = 5): any {
  if (depth > maxDepth) {
    return '[Max Depth Reached]';
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular Reference]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((v) => sanitize(v, seen, depth + 1, maxDepth));
    }

    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'config' && v && typeof v === 'object') {
        out[k] = {
          method: v.method,
          url: v.url,
          baseURL: v.baseURL,
          headers: v.headers,
          timeout: v.timeout,
          responseType: v.responseType
        };
        continue;
      }

      const sanitized = sanitize(v, seen, depth + 1, maxDepth);
      if (sanitized !== undefined) {
        out[k] = sanitized;
      }
    }
    return out;
  }

  return undefined;
}

export const mongoSink: AsyncSink = async (record) => {
  const { level, message, category, properties } = record;

  try {
    await getMongoLog().create({
      text: message,
      level,
      category,
      metadata: sanitize(properties)
    });
  } catch (error) {
    console.error('[MongoSink] write failed', error);
  }
};
