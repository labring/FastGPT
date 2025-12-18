import { z } from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';

// Get Playground Visibility Config Parameters
export const GetPlaygroundVisibilityConfigParamsSchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  })
});
export type GetPlaygroundVisibilityConfigParamsType = z.infer<
  typeof GetPlaygroundVisibilityConfigParamsSchema
>;

// Playground Visibility Config Response
export const PlaygroundVisibilityConfigResponseSchema = z.object({
  showNodeStatus: z.boolean().meta({
    example: true,
    description: '是否显示节点状态'
  }),
  responseDetail: z.boolean().meta({
    example: true,
    description: '是否显示响应详情'
  }),
  showFullText: z.boolean().meta({
    example: true,
    description: '是否显示全文'
  }),
  showRawSource: z.boolean().meta({
    example: true,
    description: '是否显示原始来源'
  })
});
export type PlaygroundVisibilityConfigResponseType = z.infer<
  typeof PlaygroundVisibilityConfigResponseSchema
>;

// Update Playground Visibility Config Parameters
export const UpdatePlaygroundVisibilityConfigParamsSchema = z.object({
  appId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  showNodeStatus: z.boolean().meta({
    example: true,
    description: '是否显示节点状态'
  }),
  responseDetail: z.boolean().meta({
    example: true,
    description: '是否显示响应详情'
  }),
  showFullText: z.boolean().meta({
    example: true,
    description: '是否显示全文'
  }),
  showRawSource: z.boolean().meta({
    example: true,
    description: '是否显示原始来源'
  })
});
export type UpdatePlaygroundVisibilityConfigParamsType = z.infer<
  typeof UpdatePlaygroundVisibilityConfigParamsSchema
>;
