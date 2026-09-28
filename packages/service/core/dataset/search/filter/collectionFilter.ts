import json5 from 'json5';
import safeRegex from 'safe-regex';
import type { DatasetTagCompareOp } from '@fastgpt/global/core/dataset/constants';
import { FROM_MIGRATION_CARRIER } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from '../../collection/schema';
import { MongoDatasetCollectionTagsV2 } from '../../tag/schemaV2';
import { isCollectionTagValue } from '@fastgpt/global/core/dataset/tagUtils';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { applySharedCollectionMetadataFilters } from './shared';

/* ========== Key-Value 标签过滤类型 ========== */

/** 单条 Key-Value 标签条件：{ tagName: { $op: value } } */
type TagCondition = Record<string, Record<string, unknown>>;

/* ========== checkValue: 纯值比对算法 ========== */

// safe-regex 漏检带分支的量词组（如 (a|aa)+ 在 V8 下呈指数回溯），补充首字符重叠检测：
const hasAmbiguousAlternation = (pattern: string): boolean => {
  let s = pattern
    .replace(/\\./g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(\?:|\(\?=/g, '(');
  const innerRe = /\(([^()]*)\)([+*?]|\{\d+(?:,\d*)?\})?/;
  let m: RegExpExecArray | null;
  while ((m = innerRe.exec(s))) {
    if (m[2] && m[1].includes('|')) {
      const firstChars = new Set<string>();
      for (const alt of m[1].split('|')) {
        const c = alt.replace(/^[\\^]/, '').charAt(0);
        if (firstChars.has(c)) return true;
        firstChars.add(c);
      }
    }
    s = s.slice(0, m.index) + 'x' + s.slice(m.index + m[0].length);
  }
  return false;
};

/**
 * 判定操作符是否为否定或允许未打标（absent）条件。
 * 当集合未配置该标签时：
 * - 否定/空值类操作符视为满足条件（未打标自然“为空”、“不是目标值”、“不包含目标项”等）；
 * - 肯定类操作符视为不满足条件（“等于”、“包含”、“不为空”等）。
 */
export const isAbsentAllowedOp = (op: string): boolean => {
  switch (op) {
    case '$empty':
    case '$ne':
    case '$isNot':
    case '$notContains':
    case '$notIn':
      return true;
    default:
      return false;
  }
};

/**
 * 比对标签目标值与集合存储值是否满足操作符要求。
 * - number / datetime：统一按数值/时间戳进行大小与等值比对，支持标准时间字符串自动转时间戳。
 * - array：支持包含、属于、等值等集合操作。
 * - string：支持正则、包含、前缀、后缀、等值比对。
 */
export function checkValue(
  op: DatasetTagCompareOp,
  target: unknown,
  storedVal: string | number | string[] | null | undefined,
  tagType: string
): boolean {
  if (op === '$empty') {
    return tagType === 'array'
      ? !Array.isArray(storedVal) || storedVal.length === 0
      : storedVal === null || storedVal === undefined || storedVal === '';
  }
  if (op === '$notEmpty') {
    return tagType === 'array'
      ? Array.isArray(storedVal) && storedVal.length > 0
      : storedVal !== null && storedVal !== undefined && storedVal !== '';
  }

  if (target === null || target === undefined) return false;

  switch (tagType) {
    case 'number':
    case 'datetime': {
      const toNumericOrTimestamp = (val: unknown): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (!trimmed) return NaN;
          const num = Number(trimmed);
          if (Number.isFinite(num)) return num;
          const time = new Date(trimmed).getTime();
          return Number.isNaN(time) ? NaN : time;
        }
        return NaN;
      };

      const stored = toNumericOrTimestamp(storedVal);
      const t = toNumericOrTimestamp(target);
      if (isNaN(t)) return false;
      if (isNaN(stored)) {
        return op === '$ne';
      }
      switch (op) {
        case '$eq':
          return stored === t;
        case '$ne':
          return stored !== t;
        case '$gt':
          return stored > t;
        case '$lt':
          return stored < t;
        case '$gte':
          return stored >= t;
        case '$lte':
          return stored <= t;
        default:
          return false;
      }
    }
    case 'array': {
      if (!Array.isArray(storedVal)) {
        return op === '$isNot' || op === '$notContains' || op === '$notIn';
      }
      const stored = storedVal;
      const targetArray = Array.isArray(target)
        ? target.filter((item): item is string => typeof item === 'string')
        : [];
      const equal = (left: string[], right: string[]) => {
        const rightSet = new Set(right);
        return new Set(left).size === rightSet.size && left.every((item) => rightSet.has(item));
      };
      const subset = (left: string[], right: string[]) =>
        left.every((item) => right.includes(item));
      const targets = typeof target === 'string' ? [target] : targetArray;
      switch (op) {
        case '$is':
          return Array.isArray(target) && equal(stored, targetArray);
        case '$isNot':
          return Array.isArray(target) && !equal(stored, targetArray);
        case '$contains':
          return targets.length > 0 && targets.every((item) => stored.includes(item));
        case '$notContains':
          return targets.length > 0 && targets.every((item) => !stored.includes(item));
        case '$in':
          return Array.isArray(target) && subset(stored, targetArray);
        case '$notIn':
          return Array.isArray(target) && !subset(stored, targetArray);
        default:
          return false;
      }
    }

    case 'string':
    default: {
      const stored = String(storedVal ?? '');
      const t = String(target);
      switch (op) {
        case '$eq':
          return stored === t;
        case '$ne':
          return stored !== t;
        case '$contains':
          return stored.toLowerCase().includes(t.toLowerCase());
        case '$notContains':
          return !stored.toLowerCase().includes(t.toLowerCase());
        case '$startsWith':
          return stored.toLowerCase().startsWith(t.toLowerCase());
        case '$endsWith':
          return stored.toLowerCase().endsWith(t.toLowerCase());
        case '$regex':
          try {
            if (t.length > 64 || stored.length > 256) return false;
            if (!safeRegex(t) || hasAmbiguousAlternation(t)) return false;
            return new RegExp(t).test(stored);
          } catch {
            return false;
          }
        default:
          return false;
      }
    }
  }
}

/* ========== filterCollectionByKeyValueTags ========== */

/**
 * Filter collections by key-value tag conditions.
 *
 * AND conditions must all be satisfied; OR conditions need at least one match.
 * A condition whose tag does not exist in a dataset fails that condition:
 * AND → no match; OR → that condition does not count as a match.
 */
export async function filterCollectionByKeyValueTags({
  $and,
  $or,
  teamId,
  datasetIds
}: {
  $and: TagCondition[];
  $or: TagCondition[];
  teamId: string;
  datasetIds: string[];
}): Promise<string[] | undefined> {
  const allConditions = [...$and, ...$or];
  const tagNames = new Set<string>();
  for (const cond of allConditions) {
    const tagName = Object.keys(cond)[0];
    if (!tagName) continue;
    tagNames.add(tagName);
  }
  if (tagNames.size === 0) return undefined;

  const hasMigrationCondition = tagNames.has(FROM_MIGRATION_CARRIER);
  const tagDocs = await MongoDatasetCollectionTagsV2.find(
    {
      teamId,
      datasetId: { $in: datasetIds },
      $or: [
        { tag: { $in: [...tagNames] } },
        ...(hasMigrationCondition ? [{ fromMigration: true }] : [])
      ]
    },
    '_id datasetId tag tagType fromMigration',
    { ...readFromSecondary }
  ).lean();

  const datasetTagMap = new Map<string, Map<string, { id: string; type: string }>>();
  const addToMap = (dsId: string, tagName: string, id: string, type: string) => {
    const tagMap = datasetTagMap.get(dsId);
    if (tagMap) {
      tagMap.set(tagName, { id, type });
      return;
    }
    datasetTagMap.set(dsId, new Map([[tagName, { id, type }]]));
  };
  for (const doc of tagDocs) {
    addToMap(String(doc.datasetId), doc.tag, String(doc._id), doc.tagType ?? 'string');
    // 迁移承载记录的身份唯一由 fromMigration: true 标识，不依赖可修改的标签名称
    if (doc.fromMigration) {
      addToMap(
        String(doc.datasetId),
        FROM_MIGRATION_CARRIER,
        String(doc._id),
        doc.tagType ?? 'array'
      );
    }
  }
  if (datasetTagMap.size === 0) return [];

  const matchCondition = (
    cond: TagCondition,
    tagMap: Map<string, { id: string; type: string }>,
    tagsArr: Array<{ tagId: string; value?: string | number | string[] }>
  ): boolean => {
    const tagName = Object.keys(cond)[0];
    const tagInfo = tagMap.get(tagName);
    if (!tagInfo) return false;
    const opObj = cond[tagName] as Record<string, unknown>;
    const op = Object.keys(opObj)[0];

    const entry = tagsArr.find((t) => t.tagId === tagInfo.id);
    if (!entry) {
      return isAbsentAllowedOp(op);
    }
    return checkValue(op as DatasetTagCompareOp, opObj[op], entry.value, tagInfo.type);
  };

  const allCollectionIds: string[] = [];

  for (const [dsId, tagMap] of datasetTagMap) {
    const andTagIds = $and
      .map((cond) => tagMap.get(Object.keys(cond)[0])?.id)
      .filter((id): id is string => Boolean(id));
    const orTagIds = $or
      .map((cond) => tagMap.get(Object.keys(cond)[0])?.id)
      .filter((id): id is string => Boolean(id));

    if ($and.length > 0 && andTagIds.length < $and.length) {
      continue;
    }
    if ($and.length === 0 && orTagIds.length === 0) {
      continue;
    }

    const positiveAndTagIds = $and
      .filter((cond) => {
        const tagName = Object.keys(cond)[0];
        const opObj = cond[tagName] as Record<string, unknown> | undefined;
        const op = opObj ? Object.keys(opObj)[0] : undefined;
        return op ? !isAbsentAllowedOp(op) : true;
      })
      .map((cond) => tagMap.get(Object.keys(cond)[0])?.id)
      .filter((id): id is string => Boolean(id));

    let tagIdQuery: Record<string, unknown> | undefined;
    let useTagIndexHint = false;

    if (positiveAndTagIds.length > 0) {
      tagIdQuery = { 'tags.tagId': { $all: positiveAndTagIds } };
      useTagIndexHint = true;
    } else if ($and.length === 0 && $or.length > 0) {
      const allOrPositive = $or.every((cond) => {
        const tagName = Object.keys(cond)[0];
        const opObj = cond[tagName] as Record<string, unknown> | undefined;
        const op = opObj ? Object.keys(opObj)[0] : undefined;
        return op ? !isAbsentAllowedOp(op) : true;
      });

      if (allOrPositive) {
        const positiveOrTagIds = $or
          .map((cond) => tagMap.get(Object.keys(cond)[0])?.id)
          .filter((id): id is string => Boolean(id));
        if (positiveOrTagIds.length > 0) {
          tagIdQuery = { 'tags.tagId': { $in: positiveOrTagIds } };
          useTagIndexHint = true;
        }
      }
    }

    const findQuery = MongoDatasetCollection.find(
      { teamId, datasetId: dsId, ...(tagIdQuery ?? {}) },
      '_id tags',
      { ...readFromSecondary }
    );
    if (useTagIndexHint) {
      findQuery.hint({ teamId: 1, datasetId: 1, 'tags.tagId': 1 });
    }
    const collections = await findQuery.lean();

    for (const col of collections) {
      const tagsArr = (col.tags ?? []).filter(isCollectionTagValue);

      const andOk = $and.every((cond) => matchCondition(cond, tagMap, tagsArr));
      if (!andOk) continue;

      if ($or.length > 0) {
        const orOk = $or.some((cond) => matchCondition(cond, tagMap, tagsArr));
        if (!orOk) continue;
      }

      allCollectionIds.push(String(col._id));
    }
  }

  return allCollectionIds.length > 0 ? allCollectionIds : [];
}

export const getForbidCollectionIdList = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}) => {
  const collections = await MongoDatasetCollection.find(
    {
      teamId,
      datasetId: { $in: datasetIds },
      forbid: true
    },
    '_id'
  );

  return collections.map((item) => String(item._id));
};

/**
 * 知识库检索元数据过滤核心（只兼容结构化数组）。
 * 输入必须是经过搜索入口归一化后的标准结构化 JSON。
 */
export const filterCollectionByMetadata = async ({
  teamId,
  datasetIds,
  collectionFilterMatch
}: {
  teamId: string;
  datasetIds: string[];
  collectionFilterMatch?: string;
}): Promise<string[] | undefined> => {
  if (!collectionFilterMatch || !global.feConfigs.isPlus) return;

  const metadataMatch = json5.parse(collectionFilterMatch) as {
    tags?: { $and?: unknown[]; $or?: unknown[] };
    createTime?: { $gte?: string; $lte?: string };
    collectionIds?: string[];
  };

  const isConditionObject = (item: unknown): item is TagCondition => {
    if (typeof item !== 'object' || Array.isArray(item) || item === null) return false;
    const tagNames = Object.keys(item);
    if (tagNames.length !== 1 || !tagNames[0]) return false;
    const operation = Reflect.get(item, tagNames[0]);
    return (
      typeof operation === 'object' &&
      !Array.isArray(operation) &&
      operation !== null &&
      Object.keys(operation).length === 1
    );
  };

  const parseConditions = (items?: unknown[]): TagCondition[] => {
    if (!items) return [];
    if (!items.every(isConditionObject)) throw CommonErrEnum.invalidParams;
    return items;
  };

  const andTags = parseConditions(metadataMatch.tags?.$and);
  const orTags = parseConditions(metadataMatch.tags?.$or);

  const tagCollectionIds =
    andTags.length > 0 || orTags.length > 0
      ? await filterCollectionByKeyValueTags({
          $and: andTags,
          $or: orTags,
          teamId,
          datasetIds
        })
      : undefined;

  return applySharedCollectionMetadataFilters({
    teamId,
    datasetIds,
    metadataMatch,
    tagCollectionIds
  });
};
