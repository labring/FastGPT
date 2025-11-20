import type { ToolListBody, ToolListResponse } from '@/pages/api/tool/list';
import type { ToolDetailResponse } from '@/pages/api/tool/detail';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';

export const getMarketplaceTools = async (body: ToolListBody) => {
  const res = await fetch('api/tool/list', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  }).then((res) => res.json());
  return res.data as ToolListResponse;
};

export const getMarketplaceToolDetail = async ({ toolId }: { toolId: string }) => {
  const res = await fetch(`api/tool/detail?toolId=${toolId}`, { method: 'GET' }).then((res) =>
    res.json()
  );
  return res.data as ToolDetailResponse;
};

export const getToolTags = async () => {
  const res = await fetch('api/tool/tags', { method: 'GET' }).then((res) => res.json());
  return res.data as Array<SystemPluginToolTagType>;
};

export const getDownloadURL = async (toolId: string) => {
  const res = await fetch(`api/tool/getDownloadUrl?toolId=${toolId}`, { method: 'GET' }).then(
    (res) => res.json()
  );
  return res.data as string;
};
