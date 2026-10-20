import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { PaginationResponseSchema } from '../../api';

export const DatasetItemSchema = z.object({
  id: ObjectIdSchema.meta({ description: '知识库ID' }),
  teamId: ObjectIdSchema.meta({ description: '所属团队ID' }),
  name: z.string().meta({ description: '知识库名称' }),
  intro: z.string().meta({ description: '知识库简介' }),
  username: z.string().meta({ description: '创建者用户名' }),
  totalDatas: z.number().meta({ description: '数据总量' }),
  totalVectors: z.number().meta({ description: '向量总量' })
});
export type DatasetItemType = z.infer<typeof DatasetItemSchema>;

export const GetDatasetsResponseSchema = PaginationResponseSchema(DatasetItemSchema);
export type GetDatasetsResponseType = z.infer<typeof GetDatasetsResponseSchema>;
