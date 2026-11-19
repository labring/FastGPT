import {
  ListAppV2BodySchema,
  type ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { buildPaginationMeta } from '../../shared/input';
import { createSuccessResult } from '../../shared/result';

/** 查询当前成员可读的应用、工具和目录，沿用应用列表的搜索与分页语义。 */
export async function listApps({ client, input }: { client: FastGptHttpClient; input: unknown }) {
  const body = ListAppV2BodySchema.parse(input);
  const data = await client.request<ListAppV2ResponseType>({
    method: 'POST',
    path: '/core/app/listV2',
    body
  });

  return createSuccessResult({
    data,
    meta: buildPaginationMeta({
      validatedBody: body,
      total: data.total,
      count: data.list.length,
      nonPaginated: body.appIds !== undefined
    })
  });
}
