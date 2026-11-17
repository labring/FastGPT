import z from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { optionalEmptyToUndefined } from '../../../common/zod';
import { PaginationResponseSchema, createPaginationSchema } from '../../api';

// App type schema
export const AppItemSchema = z.object({
  id: z.string().meta({ description: '应用ID' }),
  username: z.string().meta({ description: '用户名' }),
  userId: z.string().meta({ description: '用户ID' }),
  name: z.string().meta({ description: '应用名称' }),
  intro: z.string().meta({ description: '应用简介' }),
  teamName: z.string().meta({ description: '团队名称' })
});
export type AppItemType = z.infer<typeof AppItemSchema>;

// Get apps request body schema
export const GetAppsBodySchema = createPaginationSchema({
  username: z.string().trim().max(100).optional().meta({ description: '创建者用户名（模糊匹配）' }),
  teamName: z.string().trim().max(100).optional().meta({ description: '团队名称（模糊匹配）' }),
  teamId: optionalEmptyToUndefined(ObjectIdSchema).meta({ description: '团队ID（精确匹配）' }),
  appId: optionalEmptyToUndefined(ObjectIdSchema).meta({ description: '应用ID（精确匹配）' }),
  appName: z.string().trim().max(100).optional().meta({ description: '应用名称（模糊匹配）' })
});
export type GetAppsBodyType = z.infer<typeof GetAppsBodySchema>;

// Get apps response schema
export const GetAppsResponseSchema = PaginationResponseSchema(AppItemSchema);
export type GetAppsResponseType = z.infer<typeof GetAppsResponseSchema>;
