import type { ActiveTmpDataFilter, TmpDataMaterial } from '../domain/tmpData';
import type { TransactionContext } from '../transaction';

/** 验证码材料的最小 DAL 能力，供 verification 在 DAL 事务内读取与消费。 */
export type TmpDataRepository = {
  findActiveMaterial(
    filter: ActiveTmpDataFilter,
    context?: TransactionContext
  ): Promise<TmpDataMaterial | null>;
  deleteActiveMaterial(filter: ActiveTmpDataFilter, context?: TransactionContext): Promise<boolean>;
};
