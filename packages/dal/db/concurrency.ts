import type { EntityId } from '../domain';
import type { TransactionContext } from '../transaction';

/** 期望状态：并发更新（CAS）时用于匹配的当前值子集，字段为领域字段。 */
export type ExpectedState<T> = Partial<T>;

/**
 * 并发更新契约：按期望状态做原子条件更新。
 * 文档不存在返回 null；文档存在但期望状态不匹配时抛 DatabaseConflictError（DB_CONFLICT），
 * 与「资源不存在」的 null 语义区分开。
 */
export type CasUpdate<T, P> = {
  updateByIdIfState(
    id: EntityId,
    expected: ExpectedState<T>,
    patch: P,
    context?: TransactionContext
  ): Promise<T | null>;
};
