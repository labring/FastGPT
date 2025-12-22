import { z } from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';

// Playground Visibility Config Fields
const PlaygroundVisibilityConfigFieldsSchema = z.object({
  showRunningStatus: z.boolean().meta({
    example: true,
    description: '是否显示运行状态'
  }),
  showCite: z.boolean().meta({
    example: true,
    description: '是否显示引用'
  }),
  showFullText: z.boolean().meta({
    example: true,
    description: '是否显示全文'
  }),
  canDownloadSource: z.boolean().meta({
    example: true,
    description: '是否可下载来源'
  })
});

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
export const PlaygroundVisibilityConfigResponseSchema = PlaygroundVisibilityConfigFieldsSchema;
export type PlaygroundVisibilityConfigResponseType = z.infer<
  typeof PlaygroundVisibilityConfigResponseSchema
>;

// Update Playground Visibility Config Parameters
export const UpdatePlaygroundVisibilityConfigParamsSchema = z
  .object({
    appId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '应用 ID'
    })
  })
  .extend(PlaygroundVisibilityConfigFieldsSchema.shape);
export type UpdatePlaygroundVisibilityConfigParamsType = z.infer<
  typeof UpdatePlaygroundVisibilityConfigParamsSchema
>;
