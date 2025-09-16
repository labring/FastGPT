import { c } from '../../init';
import { AppListParamsSchema, AppListResponseSchema } from '../../../../core/app/type.d';

export const appContract = c.router({
  list: {
    method: 'POST',
    path: '/core/app/list',
    body: AppListParamsSchema,
    responses: {
      200: AppListResponseSchema
    },
    summary: '获取应用列表'
  }
});
