import z from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import { PlaygroundVisibilityConfigSchema } from '../../../../../support/outLink/type';

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

// Update Playground Visibility Config Parameters
export const UpdatePlaygroundVisibilityConfigParamsSchema = z
  .object({
    appId: ObjectIdSchema.meta({
      example: '68ad85a7463006c963799a05',
      description: '应用 ID'
    })
  })
  .extend(PlaygroundVisibilityConfigSchema.shape);
export type UpdatePlaygroundVisibilityConfigParamsType = z.infer<
  typeof UpdatePlaygroundVisibilityConfigParamsSchema
>;

export const PlaygroundUpdateResponseSchema = z.undefined().meta({
  description: '更新成功'
});
export type PlaygroundUpdateResponseType = z.infer<typeof PlaygroundUpdateResponseSchema>;
