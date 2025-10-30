import type { ToolListBody, ToolListResponse } from '@/pages/api/tool/list';
import type { GetToolTagsResponse, ToolDetailResponse } from '@fastgpt/global/core/app/plugin/type';

export const getMarketplaceTools = async (body: ToolListBody) => {
  const res = await fetch('api/tool/list', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  }).then((res) => res.json());
  return res.data as Promise<ToolListResponse>;
};

export const getMarketplaceToolDetail = async ({ toolId }: { toolId: string }) => {
  const res = await fetch(`api/tool/detail?toolId=${toolId}`, { method: 'GET' }).then((res) =>
    res.json()
  );
  return res.data as Promise<ToolDetailResponse>;
};

export const getToolTags = async () => {
  const res = await fetch('api/tool/tags', { method: 'GET' }).then((res) => res.json());
  return res.data as Promise<GetToolTagsResponse>;
};
