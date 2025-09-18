import { c } from '../../init';
import { AppListParamsSchema, AppListResponseSchema } from '../../../../core/app/type';

export const appContract = c.router({
  list: {
    method: 'POST',
    path: '/core/app/list',
    body: AppListParamsSchema,
    responses: {
      200: AppListResponseSchema
    },
    metadata: {
      openApiTags: ['应用']
    },
    description: '根据参数 `parentId`、`type`、`getRecentlyChat`、`searchKey` 获取应用列表',
    summary: '获取应用列表'
  }
});
