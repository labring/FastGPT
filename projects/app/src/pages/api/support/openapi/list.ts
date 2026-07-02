import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getOpenApiTagMap } from '@fastgpt/service/support/openapi/tag/service';
import {
  GetApiKeyListQuerySchema,
  GetApiKeyListResponseSchema,
  type ApiKeyListSortByType,
  type GetApiKeyListQueryType,
  type GetApiKeyListResponseType
} from '@fastgpt/global/openapi/support/openapi/api';
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';

type OpenApiListItem = OpenApiSchema & {
  canCopy: boolean;
};

const maskApiKey = (apiKey: string) => `******${apiKey.substring(apiKey.length - 4)}`;

const getRemainingPoints = (item: Pick<OpenApiSchema, 'limit' | 'usagePoints'>) => {
  const maxUsagePoints = item.limit?.maxUsagePoints ?? -1;

  if (maxUsagePoints < 0) {
    return Number.POSITIVE_INFINITY;
  }

  return maxUsagePoints - (item.usagePoints ?? 0);
};

const getSortValue = (item: OpenApiSchema, sortBy: ApiKeyListSortByType) => {
  if (sortBy === 'lastUsedTime') {
    return item.lastUsedTime ? new Date(item.lastUsedTime).getTime() : 0;
  }

  if (sortBy === 'remainingPoints') {
    return getRemainingPoints(item);
  }

  return new Date(item.createTime).getTime();
};

const compareSortValue = (a: OpenApiSchema, b: OpenApiSchema, sortBy: ApiKeyListSortByType) => {
  const aSortValue = getSortValue(a, sortBy);
  const bSortValue = getSortValue(b, sortBy);

  if (aSortValue === bSortValue) {
    return 0;
  }

  // 剩余积分排序用于优先发现即将耗尽的 Key，因此按小到大排列，不限量排最后。
  if (sortBy === 'remainingPoints') {
    return aSortValue > bSortValue ? 1 : -1;
  }

  return aSortValue > bSortValue ? -1 : 1;
};

const sortOpenApiList = ({
  list,
  appId,
  sortBy
}: {
  list: OpenApiListItem[];
  appId?: string;
  sortBy: ApiKeyListSortByType;
}) =>
  list.sort((a, b) => {
    const aAppMatched = appId && String(a.appId || '') === appId ? 1 : 0;
    const bAppMatched = appId && String(b.appId || '') === appId ? 1 : 0;

    if (aAppMatched !== bAppMatched) {
      return bAppMatched - aAppMatched;
    }

    const sortValueDiff = compareSortValue(a, b, sortBy);
    if (sortValueDiff !== 0) {
      return sortValueDiff;
    }

    return String(b._id).localeCompare(String(a._id));
  });

const filterOpenApiListByKeyword = (list: OpenApiSchema[], keyword?: string) => {
  if (!keyword) {
    return list;
  }

  const normalizedKeyword = keyword.toLowerCase();

  return list.filter((item) => {
    if (item.name.toLowerCase().includes(normalizedKeyword)) {
      return true;
    }

    // API Key 片段过滤在内存中完成，避免把用户输入的 Key 片段写入 Mongo 查询和慢查询日志。
    return item.apiKey.toLowerCase().includes(normalizedKeyword);
  });
};

async function handler(
  req: ApiRequestProps<any, GetApiKeyListQueryType>
): Promise<GetApiKeyListResponseType> {
  const { keyword, tags, appId, sortBy } = parseApiInput({
    req,
    querySchema: GetApiKeyListQuerySchema
  }).query;
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true
  });

  const findResponse = await MongoOpenApi.find({
    teamId,
    tmbId,
    ...(tags && tags.length > 0
      ? {
          tagIds: {
            $all: tags
          }
        }
      : {})
  })
    .sort({ _id: -1 })
    .lean();

  const openApis = filterOpenApiListByKeyword(findResponse as OpenApiSchema[], keyword);
  const tagMap = await getOpenApiTagMap({
    teamId,
    tmbId,
    tagIds: openApis.flatMap((item) => item.tagIds || [])
  });
  const responseList = sortOpenApiList({
    list: openApis.map((item) => ({
      ...item,
      apiKey: maskApiKey(item.apiKey),
      tagIds: item.tagIds || [],
      tags: (item.tagIds || []).flatMap((tagId) => {
        const tag = tagMap.get(String(tagId));
        return tag ? [tag] : [];
      }),
      canCopy: true
    })),
    appId,
    sortBy
  });

  return GetApiKeyListResponseSchema.parse(responseList);
}

export default NextAPI(handler);
