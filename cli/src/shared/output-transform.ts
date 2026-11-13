import { CliArgumentError } from './errors';

const UNSAFE_PATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function projectRecordFields(
  record: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const fieldPath of fields) {
    const segments = fieldPath
      .split('.')
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length === 0 || segments.some((s) => UNSAFE_PATH_KEYS.has(s))) {
      continue;
    }

    // 读取源对象中的嵌套值
    let cursor: unknown = record;
    let found = true;
    for (const seg of segments) {
      if (cursor !== null && typeof cursor === 'object' && Object.hasOwn(cursor, seg)) {
        cursor = (cursor as Record<string, unknown>)[seg];
      } else {
        found = false;
        break;
      }
    }
    if (!found) {
      continue;
    }

    // 写入目标对象（保留嵌套路径）
    let target: Record<string, unknown> = result;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const seg = segments[i];
      if (!target[seg] || typeof target[seg] !== 'object' || Array.isArray(target[seg])) {
        target[seg] = {};
      }
      target = target[seg] as Record<string, unknown>;
    }
    target[segments[segments.length - 1]] = cursor;
  }
  return result;
}

/**
 * 按 `--fields <f1,f2,...>` 对输出数据进行白名单字段投影：
 * - 若 `data` 为数组，则投影每个元素；
 * - 若 `data` 包含 `list` 数组（FastGPT 标准分页结构），则保留 `total` 等外层键并对 `data.list[]` 做投影；
 * - 否则直接投影 `data` 本身。
 */
export function applyFieldsProjection({
  data,
  fields
}: {
  data: unknown;
  fields: readonly string[];
}): unknown {
  if (fields.length === 0 || data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? projectRecordFields(item as Record<string, unknown>, fields)
        : item
    );
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.list)) {
      return {
        ...obj,
        list: obj.list.map((item) =>
          item !== null && typeof item === 'object' && !Array.isArray(item)
            ? projectRecordFields(item as Record<string, unknown>, fields)
            : item
        )
      };
    }
    return projectRecordFields(obj, fields);
  }

  return data;
}

function resolveDotPath(
  root: unknown,
  segments: readonly string[]
): { found: boolean; value: unknown } {
  let cursor: unknown = root;
  for (const seg of segments) {
    if (UNSAFE_PATH_KEYS.has(seg)) {
      return { found: false, value: undefined };
    }
    if (Array.isArray(cursor)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cursor.length) {
        return { found: false, value: undefined };
      }
      cursor = cursor[idx];
      continue;
    }
    if (cursor !== null && typeof cursor === 'object' && Object.hasOwn(cursor, seg)) {
      cursor = (cursor as Record<string, unknown>)[seg];
      continue;
    }
    return { found: false, value: undefined };
  }
  return { found: true, value: cursor };
}

/**
 * 按 `--pick <dot-path>` 从信封或 `data` 中提取指定路径值；未命中时抛出带可用键提示的 CliArgumentError。
 */
export function pickDotPath({
  envelope,
  path
}: {
  envelope: Record<string, unknown>;
  path: string;
}): unknown {
  const segments = path
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    throw new CliArgumentError('--pick path cannot be empty.');
  }

  const fromEnvelope = resolveDotPath(envelope, segments);
  if (fromEnvelope.found) {
    return fromEnvelope.value;
  }

  // 若路径未显式写 `data.` 前缀，允许直接从 `envelope.data` 起解析（如 `--pick datasetId`）
  if (segments[0] !== 'data' && segments[0] !== 'meta' && envelope.data !== undefined) {
    const fromData = resolveDotPath(envelope.data, segments);
    if (fromData.found) {
      return fromData.value;
    }
  }

  const availableDataKeys =
    envelope.data && typeof envelope.data === 'object' && !Array.isArray(envelope.data)
      ? Object.keys(envelope.data as Record<string, unknown>)
      : [];
  const hint =
    availableDataKeys.length > 0
      ? `Available top-level keys under data: ${availableDataKeys.slice(0, 12).join(', ')}`
      : 'Use --format json without --pick to inspect available fields.';

  throw new CliArgumentError(`Path "${path}" not found in command output.`, undefined, hint);
}
