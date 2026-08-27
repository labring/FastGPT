import json5 from 'json5';
import safeRegex from 'safe-regex';
import { MongoDatasetCollection } from '../../collection/schema';
import { MongoDatasetCollectionTagsV2 } from '../../tag/schemaV2';
import { DEFAULT_TAG } from '@fastgpt/global/core/dataset/type';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { computeFilterIntersection } from '../utils';

/* ========== New format key-value tag filtering types ========== */

/** A single key-value tag condition: { tagName: { $op: value } } */
type TagCondition = Record<string, Record<string, unknown>>;

/* ========== checkValue: pure value comparsion ========== */

// safe-regex 漏检带分支的量词组（如 (a|aa)+ 在 V8 下呈指数回溯），补充首字符重叠检测：
// 逐层展平分组，量词作用域内含分支且分支首字符重叠 → 不安全
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

type CompareOp =
  | '$eq'
  | '$ne'
  | '$gt'
  | '$lt'
  | '$gte'
  | '$lte'
  | '$contains'
  | '$notContains'
  | '$startsWith'
  | '$endsWith'
  | '$regex'
  | '$is'
  | '$isNot'
  | '$in'
  | '$notIn'
  | '$empty'
  | '$notEmpty';

export function checkValue(
  op: CompareOp,
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
      const stored = Number(storedVal);
      const t = Number(target);
      if (isNaN(stored) || isNaN(t)) return false;
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
      if (!Array.isArray(storedVal)) return false;
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
      switch (op) {
        case '$is':
          return Array.isArray(target) && equal(stored, targetArray);
        case '$isNot':
          return Array.isArray(target) && !equal(stored, targetArray);
        case '$contains':
          return typeof target === 'string' && stored.includes(target);
        case '$notContains':
          return typeof target === 'string' && !stored.includes(target);
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
          // 用户可控 pattern：限制长度并拦截灾难性回溯，防止 ReDoS
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
 * Filter collections by key-value tag conditions (new format).
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
  let hasDefaultTag = false;
  for (const cond of allConditions) {
    const tagName = Object.keys(cond)[0];
    if (!tagName) continue;
    if (tagName === DEFAULT_TAG) hasDefaultTag = true;
    else tagNames.add(tagName);
  }
  if (tagNames.size === 0 && !hasDefaultTag) return undefined;

  // 普通标签按名称查询；default_tag 承载记录按 fromMigration 定位，不依赖标签名（改名后旧格式过滤仍命中）
  const [regularTagDocs, defaultTagDocs] = await Promise.all([
    tagNames.size
      ? MongoDatasetCollectionTagsV2.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            tag: { $in: Array.from(tagNames) }
          },
          '_id datasetId tag tagType',
          { ...readFromSecondary }
        ).lean()
      : [],
    hasDefaultTag
      ? MongoDatasetCollectionTagsV2.find(
          { teamId, datasetId: { $in: datasetIds }, fromMigration: true },
          '_id datasetId tag tagType',
          { ...readFromSecondary }
        ).lean()
      : []
  ]);

  const datasetTagMap = new Map<string, Map<string, { id: string; type: string }>>();
  const addToMap = (dsId: string, tagName: string, id: string, type: string) => {
    if (!datasetTagMap.has(dsId)) datasetTagMap.set(dsId, new Map());
    datasetTagMap.get(dsId)!.set(tagName, { id, type });
  };
  for (const doc of regularTagDocs) {
    addToMap(String(doc.datasetId), doc.tag, String(doc._id), doc.tagType || 'string');
  }
  // default_tag 记录同时挂 DEFAULT_TAG 键与实际标签名键；每 dataset 的 DEFAULT_TAG 键只取一条避免歧义
  for (const doc of defaultTagDocs) {
    const dsId = String(doc.datasetId);
    const id = String(doc._id);
    const type = doc.tagType || 'string';
    addToMap(dsId, doc.tag, id, type);
    if (!datasetTagMap.get(dsId)?.has(DEFAULT_TAG)) {
      addToMap(dsId, DEFAULT_TAG, id, type);
    }
  }
  if (datasetTagMap.size === 0) return [];

  // 3. Check a single value condition against one collection's tags.
  // Tag missing in the dataset → not satisfied; entry missing in the collection
  // → not satisfied.
  const matchCondition = (
    cond: TagCondition,
    tagMap: Map<string, { id: string; type: string }>,
    tagsArr: Array<{ tagId: string; value?: string | number | string[] }>
  ): boolean => {
    const tagName = Object.keys(cond)[0];
    const tagInfo = tagMap.get(tagName);
    if (!tagInfo) return false;
    const entry = tagsArr.find((t) => t.tagId === tagInfo.id);
    if (!entry) return false;
    const opObj = cond[tagName] as Record<string, unknown>;
    const op = Object.keys(opObj)[0];
    return checkValue(op as CompareOp, opObj[op], entry.value, tagInfo.type);
  };

  const allCollectionIds: string[] = [];

  // 4. Iterate each dataset (the same tag name may map to different tagIds per dataset)
  for (const [dsId, tagMap] of datasetTagMap) {
    const andTagIds = ($and || [])
      .map((cond) => tagMap.get(Object.keys(cond)[0])?.id)
      .filter((id): id is string => Boolean(id));
    const orTagIds = ($or || [])
      .map((cond) => tagMap.get(Object.keys(cond)[0])?.id)
      .filter((id): id is string => Boolean(id));

    if (andTagIds.length === 0 && orTagIds.length === 0) continue;

    // Mongo pre-filter by tagId. AND → $all (more precise); pure OR → $in.
    // A single 'tags.tagId' predicate keeps the compound index
    // { teamId, datasetId, 'tags.tagId' } usable; exact matching happens below.
    const tagIdQuery =
      andTagIds.length > 0
        ? { 'tags.tagId': { $all: andTagIds } }
        : { 'tags.tagId': { $in: orTagIds } };

    const collections = await MongoDatasetCollection.find(
      { teamId, datasetId: dsId, ...tagIdQuery },
      '_id tags',
      { ...readFromSecondary }
    )
      // 生产环境同时存在 {teamId,datasetId,tags} 与 {teamId,datasetId,'tags.tagId'} 两个多键索引时，
      // 查询规划器可能误选前者（在整段 tags 数组上建索引，无法精准定位 tagId），导致全表 FETCH（实测慢约 8x）。
      // 这里用 hint 强制走 tags.tagId 索引，避免依赖规划器的索引选择。
      .hint({ teamId: 1, datasetId: 1, 'tags.tagId': 1 })
      .lean();

    // 5. Application-layer value comparison
    for (const col of collections) {
      const tagsArr = (
        (col.tags || []) as Array<{ tagId?: string; value?: string | number | string[] } | string>
      ).filter(
        (t): t is { tagId: string; value?: string | number | string[] } =>
          typeof t === 'object' && t !== null && Boolean(t.tagId)
      );

      // AND: all must pass
      const andOk = ($and || []).every((cond) => matchCondition(cond, tagMap, tagsArr));
      if (!andOk) continue;

      // OR: at least one must pass
      if ($or?.length) {
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
 * 按知识库集合元数据过滤 collectionId。
 *
 * 标签过滤保持原有语义：`$and` 优先生效，且 `$and` 中字符串标签和 null 不能共存。
 * 输入 collectionIds 可以是文件夹，会递归展开为实际文件集合。
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
  const getAllCollectionIds = async ({
    parentCollectionIds
  }: {
    parentCollectionIds?: string[];
  }): Promise<string[] | undefined> => {
    if (!parentCollectionIds) return;
    if (parentCollectionIds.length === 0) {
      return [];
    }

    const collections = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        _id: { $in: parentCollectionIds }
      },
      '_id type',
      {
        ...readFromSecondary
      }
    ).lean();

    const resultIds = new Set<string>();
    collections.forEach((item) => {
      if (item.type !== 'folder') {
        resultIds.add(String(item._id));
      }
    });

    const folderIds = collections
      .filter((item) => item.type === 'folder')
      .map((item) => String(item._id));

    // Get all child collection ids
    if (folderIds.length) {
      const childCollections = await MongoDatasetCollection.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          parentId: { $in: folderIds }
        },
        '_id type',
        {
          ...readFromSecondary
        }
      ).lean();

      const childIds = await getAllCollectionIds({
        parentCollectionIds: childCollections.map((item) => String(item._id))
      });

      childIds?.forEach((id) => resultIds.add(id));
    }

    return Array.from(resultIds);
  };

  if (!collectionFilterMatch || !global.feConfigs.isPlus) return;

  let tagCollectionIdList: string[] | undefined = undefined;
  let createTimeCollectionIdList: string[] | undefined = undefined;
  let inputCollectionIdList: string[] | undefined = undefined;

  try {
    const jsonMatch = json5.parse(collectionFilterMatch);

    const andTagsRaw = jsonMatch?.tags?.$and as unknown[] | undefined;
    const orTagsRaw = jsonMatch?.tags?.$or as unknown[] | undefined;

    const isConditionObject = (item: unknown): item is TagCondition =>
      typeof item === 'object' && !Array.isArray(item) && item !== null;
    const rewriteLegacyTags = (items: unknown[] | undefined): TagCondition[] =>
      (items || []).map((item) => {
        if (isConditionObject(item)) return item;
        if (item === null) return { [DEFAULT_TAG]: { $empty: true } };
        return { [DEFAULT_TAG]: { $contains: String(item) } };
      });
    const hasLegacyMixedNull = (items: unknown[] | undefined) =>
      Boolean(
        items?.some((item) => item === null) && items.some((item) => typeof item === 'string')
      );

    if (hasLegacyMixedNull(andTagsRaw) || hasLegacyMixedNull(orTagsRaw)) return [];

    const rewrittenAnd = rewriteLegacyTags(andTagsRaw);
    const rewrittenOr = rewriteLegacyTags(orTagsRaw);
    if (rewrittenAnd.length > 0 || rewrittenOr.length > 0) {
      tagCollectionIdList = await filterCollectionByKeyValueTags({
        $and: rewrittenAnd,
        $or: rewrittenOr,
        teamId,
        datasetIds
      });
    }

    // time
    const getCreateTime = jsonMatch?.createTime?.$gte as string | undefined;
    const lteCreateTime = jsonMatch?.createTime?.$lte as string | undefined;
    if (getCreateTime || lteCreateTime) {
      const collections = await MongoDatasetCollection.find(
        {
          teamId,
          datasetId: { $in: datasetIds },
          createTime: {
            ...(getCreateTime && { $gte: new Date(getCreateTime) }),
            ...(lteCreateTime && {
              $lte: new Date(lteCreateTime)
            })
          }
        },
        '_id'
      );
      createTimeCollectionIdList = collections.map((item) => String(item._id));
    }

    // collectionIds
    const inputCollectionIds = jsonMatch?.collectionIds as string[] | undefined;
    if (Array.isArray(inputCollectionIds) && inputCollectionIds.length > 0) {
      inputCollectionIdList = await getAllCollectionIds({
        parentCollectionIds: inputCollectionIds
      });
      if (inputCollectionIdList && inputCollectionIdList.length === 0) {
        return [];
      }
    }

    // Concat tag, time and collectionIds
    const collectionIds = computeFilterIntersection([
      tagCollectionIdList,
      createTimeCollectionIdList,
      inputCollectionIdList
    ]);

    return await getAllCollectionIds({
      parentCollectionIds: collectionIds
    });
  } catch {}
};
