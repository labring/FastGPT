import {
  TmpDataMaterialSchema,
  type TmpDataMaterial
} from '../../../../../business/support/user/verification/entity';
import type { TmpDataDocument } from './schema';

/** 将 Mongo 临时数据文档映射为数据库无关的验证材料实体。 */
export const toTmpDataMaterial = (document: TmpDataDocument): TmpDataMaterial =>
  TmpDataMaterialSchema.parse({
    dataId: document.dataId,
    data: document.data,
    expireAt: document.expireAt
  });
