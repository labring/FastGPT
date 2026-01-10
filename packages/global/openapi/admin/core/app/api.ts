import { z } from 'zod';
import { PaginationSchema, PaginationResponseSchema } from '../../../api';

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
export const GetAppsBodySchema = PaginationSchema.extend({
  searchKey: z.string().nullish().meta({ description: '搜索关键词（支持应用名称和应用ID）' })
});
export type GetAppsBodyType = z.infer<typeof GetAppsBodySchema>;

// Get apps response schema
export const GetAppsResponseSchema = PaginationResponseSchema(AppItemSchema);
export type GetAppsResponseType = z.infer<typeof GetAppsResponseSchema>;
