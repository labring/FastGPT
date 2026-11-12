import { getToolList } from '@/service/tool/data';
import { type ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { getPkgdownloadURL, getReadmeURL } from '@/service/s3';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import {
  GetMarketplaceToolDetailQuerySchema,
  type GetMarketplaceToolDetailQueryType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { NextAPI } from '@/service/middleware/entry';

export type ToolDetailQuery = GetMarketplaceToolDetailQueryType;
export type ToolDetailBody = {};

export type ToolDetailResponse = {
  tools: Array<
    Omit<ToolDetailType, 'type'> & {
      type?: 'tool' | 'moderation';
      readme: string;
      readmeUrls?: Partial<Record<localeType, string>>;
    }
  >;
  downloadCount: number;
  downloadUrl: string;
};

async function handler(
  req: ApiRequestProps<ToolDetailBody, ToolDetailQuery>,
  res: ApiResponseType<any>
): Promise<ToolDetailResponse> {
  const {
    query: { toolId, version, type }
  } = parseApiInput({
    req,
    querySchema: GetMarketplaceToolDetailQuerySchema
  });

  const parentToolId = toolId.split('/')[0];
  const toolList = await getToolList({ type, toolId: parentToolId, version });
  const tools = toolList.filter((item) => {
    const isMatchedTool = item.toolId.startsWith(toolId + '/') || item.toolId === toolId;
    const isMatchedVersion = !version || item.version === version;
    return isMatchedTool && isMatchedVersion;
  });

  if (tools.length < 1) {
    res.status(404);
    return Promise.reject('tool not found');
  }

  return {
    tools: tools.map((tool) => ({
      ...tool,
      readme: tool.readme || tool.readmeUrl || getReadmeURL(toolId)
    })),
    downloadCount: tools.find((tool) => !tool.parentId)?.downloadCount ?? 0,
    downloadUrl: tools.find((tool) => !tool.parentId)?.downloadUrl || getPkgdownloadURL(toolId)
  };
}

export default NextAPI(handler);
