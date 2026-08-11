import type { ClientSession, FilterQuery, Model } from 'mongoose';
import { normalizePageParams, type PageParams, type PageResult } from '../db';

export type PaginateParams<T> = {
  model: Model<T>;
  filter: FilterQuery<T>;
  page: PageParams['page'];
  pageSize: PageParams['pageSize'];
  sort?: Record<string, 1 | -1>;
  session?: ClientSession;
};

/**
 * Mongo 分页实现：countDocuments 与 find().sort().skip().limit().lean() 并行执行，
 * 返回统一的 PageResult。session 存在时两处查询都绑定到同一事务。
 */
export async function paginate<T>(params: PaginateParams<T>): Promise<PageResult<T>> {
  const { model, filter, page, pageSize, sort, session } = params;
  const { skip, limit } = normalizePageParams({ page, pageSize });

  const countQuery = model.countDocuments(filter);
  const findQuery = model
    .find(filter)
    .sort(sort ?? {})
    .skip(skip)
    .limit(limit);
  if (session) {
    countQuery.session(session);
    findQuery.session(session);
  }

  // 低层 helper：lean 返回 FlattenMaps 形状，由调用方映射为领域类型。
  const [total, list] = await Promise.all([
    countQuery,
    findQuery.lean() as unknown as Promise<T[]>
  ]);
  return { total, list };
}
