import type { ClientSession, FilterQuery, Model, UpdateQuery } from 'mongoose';
import type { EntityId } from '../db/types';
import { toMongoObjectId } from './utils';

export type CasUpdateByIdParams<T> = {
  model: Model<T>;
  id: EntityId;
  expected: Record<string, unknown>;
  patch: Record<string, unknown>;
  session?: ClientSession;
};

/**
 * 基于 findOneAndUpdate 的原子条件更新：filter 为 `{ _id, ...expected }`，
 * 期望状态不匹配时返回 null 且不执行更新；patch 中的 undefined 字段会被过滤。
 */
export async function casUpdateById<T>(params: CasUpdateByIdParams<T>): Promise<T | null> {
  const { model, id, expected, patch, session } = params;

  const $set = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const query = model.findOneAndUpdate(
    { _id: toMongoObjectId(id), ...expected } as FilterQuery<T>,
    { $set } as UpdateQuery<T>,
    { new: true }
  );
  if (session) query.session(session);

  // 低层 helper：lean 返回 FlattenMaps 形状，由调用方映射为领域类型。
  return query.lean() as unknown as Promise<T | null>;
}
