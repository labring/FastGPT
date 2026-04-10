import z from 'zod';
import { PublishChannelEnum } from '../../../support/outLink/constant';
import { ObjectIdSchema } from '../../../common/type/mongo';

// ============= OutLink List =============
export const OutLinkListQuerySchema = z.object({
  appId: ObjectIdSchema.describe('应用ID'),
  type: z.enum(PublishChannelEnum).describe('发布渠道类型')
});
export type OutLinkListQueryType = z.infer<typeof OutLinkListQuerySchema>;
