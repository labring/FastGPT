import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
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
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import {
  getOpenApiTypeFilter,
  getOpenApiAppIdFilter,
  resolveApiKeyScope
} from '@fastgpt/service/support/openapi/utils';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTeamMemberMap } from '@fastgpt/service/support/user/team/utils';

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
  sortBy
}: {
  list: OpenApiListItem[];
  sortBy: ApiKeyListSortByType;
}) =>
  list.sort((a, b) => {
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
  const {
    keyword,
    tags,
    appId,
    sortBy,
    type = ApiKeyTypeEnum.personal
  } = parseApiInput({
    req,
    querySchema: GetApiKeyListQuerySchema
  }).query;
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true
  });

  if (type === ApiKeyTypeEnum.app) {
    await authAppByTmbId({ tmbId, appId: appId!, per: ManagePermissionVal });
  }
  const findResponse = await MongoOpenApi.find({
    teamId,
    ...getOpenApiTypeFilter(type),
    ...(type === ApiKeyTypeEnum.app ? { appId: getOpenApiAppIdFilter([appId!]) } : { tmbId }),
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
  const [tagMap, members] = await Promise.all([
    getOpenApiTagMap({
      teamId,
      tmbId,
      tagIds: type === ApiKeyTypeEnum.personal ? openApis.flatMap((item) => item.tagIds ?? []) : []
    }),
    getTeamMemberMap({
      teamId,
      memberIds: openApis.map((item) => String(item.tmbId)),
      fields: '_id name'
    })
  ]);
  const responseList = sortOpenApiList({
    list: openApis.map((item) => {
      const scope = resolveApiKeyScope(item);
      return {
        ...item,
        appId: scope.type === ApiKeyTypeEnum.app ? scope.appId : undefined,
        ...scope,
        tmbName: members.get(String(item.tmbId))?.name,
        apiKey: maskApiKey(item.apiKey),
        authProxy: scope.type === ApiKeyTypeEnum.personal && !!item.authProxy,
        tagIds: type === ApiKeyTypeEnum.personal ? (item.tagIds ?? []) : [],
        tags: (type === ApiKeyTypeEnum.personal ? (item.tagIds ?? []) : []).flatMap((tagId) => {
          const tag = tagMap.get(String(tagId));
          return tag ? [tag] : [];
        }),
        canCopy: true
      };
    }),
    sortBy
  });

  return GetApiKeyListResponseSchema.parse(responseList);
}

export default NextAPI(handler);
