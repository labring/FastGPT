import type { Schema, UpdateQuery, UpdateWithAggregationPipeline } from 'mongoose';

type SortKeyBuilder = (name: unknown) => string;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExplicitSortKey = (target: unknown): boolean =>
  isPlainObject(target) && Object.hasOwn(target, 'nameSortKey') && target.nameSortKey !== undefined;

const syncSortKeyOnOperatorPayload = (target: unknown, buildKey: SortKeyBuilder) => {
  if (!isPlainObject(target)) return;
  if (typeof target.name === 'string' && !hasExplicitSortKey(target)) {
    target.nameSortKey = buildKey(target.name);
  }
};

/**
 * 在 Mongoose 更新载荷包含 `name` 时自动补齐 `nameSortKey`，防止未显式传排序键的写操作造成漂移。
 * 注意：`bulkWrite` 与聚合管道更新不走此分支，批写入口仍须显式写入 `nameSortKey`。
 */
export const syncNameSortKeyInUpdate = <T extends { name?: unknown; nameSortKey?: string }>(
  update: UpdateQuery<T> | UpdateWithAggregationPipeline | null,
  buildKey: SortKeyBuilder
) => {
  if (!update || Array.isArray(update)) return;

  if (
    typeof update.name === 'string' &&
    update.nameSortKey === undefined &&
    !hasExplicitSortKey(update.$set)
  ) {
    Object.assign(update, { nameSortKey: buildKey(update.name) });
  }
  syncSortKeyOnOperatorPayload(update.$set, buildKey);
  syncSortKeyOnOperatorPayload(update.$setOnInsert, buildKey);
};

/**
 * 为包含 `name` 与 `nameSortKey` 字段的 Mongoose Schema 统一挂载写入期排序键同步 Hook。
 * 覆盖 `save`、`insertMany`、`findOneAndUpdate`、`updateOne` 与 `updateMany`。
 */
export const attachNameSortKeyHooks = <T extends { name?: unknown; nameSortKey?: string }>(
  schema: Schema,
  buildKey: SortKeyBuilder
) => {
  schema.pre('save', function (next) {
    if (this.isModified('name') || !this.get('nameSortKey')) {
      this.set('nameSortKey', buildKey(this.get('name')));
    }
    next();
  });

  schema.pre('insertMany', function (next, docs: unknown) {
    const items = Array.isArray(docs) ? docs : [docs];
    for (const item of items) {
      // 仅在文档已提供字符串 name 时同步写入；未传 name 时留给 Schema default 在 name 默认值生效后计算。
      if (isPlainObject(item) && typeof item.name === 'string' && !hasExplicitSortKey(item)) {
        item.nameSortKey = buildKey(item.name);
      }
    }
    next();
  });

  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
    syncNameSortKeyInUpdate<T>(this.getUpdate(), buildKey);
    next();
  });
};
