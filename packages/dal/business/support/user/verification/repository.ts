import type { TransactionContext } from '../../../../db/transaction';
import type { ActiveTmpDataFilter } from './dto';
import type { TmpDataMaterial, TmpDataWrite } from './entity';

/** 验证码材料的最小 DAL 能力，供账户验证流程在事务内读取与消费。 */
export type TmpDataRepository = {
  findByDataId(dataId: string, context?: TransactionContext): Promise<TmpDataMaterial | null>;
  findActiveMaterial(
    filter: ActiveTmpDataFilter,
    context?: TransactionContext
  ): Promise<TmpDataMaterial | null>;
  createIfInactive(input: TmpDataWrite, context?: TransactionContext): Promise<boolean>;
  upsert(input: TmpDataWrite, context?: TransactionContext): Promise<void>;
  updateIfActive(input: TmpDataWrite, context?: TransactionContext): Promise<boolean>;
  findActiveDataIds(dataIds: readonly string[], context?: TransactionContext): Promise<string[]>;
  deleteActiveMaterial(filter: ActiveTmpDataFilter, context?: TransactionContext): Promise<boolean>;
};
