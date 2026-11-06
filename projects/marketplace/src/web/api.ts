import type { ToolListBody, ToolListResponse } from '@/pages/api/tool/list';
import type { ToolDetailResponse } from '@/pages/api/tool/detail';
import type { ToolListResponse as ToolVersionListResponse } from '@/pages/api/tool/versions';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';

export const getMarketplaceTools = async (body: ToolListBody) => {
  const res = await fetch('api/tool/list', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  }).then((res) => res.json());
  return res.data as ToolListResponse;
};

export const getMarketplaceToolDetail = async ({
  toolId,
  version,
  type
}: {
  toolId: string;
  version?: string;
  type?: 'tool' | 'moderation';
}) => {
  const params = new URLSearchParams({ toolId });
  if (version) {
    params.set('version', version);
  }
  if (type) {
    params.set('type', type);
  }

  const res = await fetch(`api/tool/detail?${params.toString()}`, { method: 'GET' }).then((res) =>
    res.json()
  );
  return res.data as ToolDetailResponse;
};

export const getMarketplaceToolVersions = async (
  toolId?: string,
  type?: 'tool' | 'moderation'
) => {
  const params = new URLSearchParams();
  if (toolId) {
    params.set('toolId', toolId);
  }
  if (type) {
    params.set('type', type);
  }
  const queryString = params.toString();
  const res = await fetch(`api/tool/versions${queryString ? `?${queryString}` : ''}`, {
    method: 'GET'
  }).then((res) => res.json());
  return res.data as ToolVersionListResponse;
};

export const getToolTags = async () => {
  const res = await fetch('api/tool/tags', { method: 'GET' }).then((res) => res.json());
  return res.data as Array<SystemPluginToolTagType>;
};

export const getDownloadURL = async (
  toolId: string,
  version?: string,
  type?: 'tool' | 'moderation'
) => {
  const params = new URLSearchParams({ toolId });
  if (version) {
    params.set('version', version);
  }
  if (type) {
    params.set('type', type);
  }

  const res = await fetch(`api/tool/getDownloadUrl?${params.toString()}`, { method: 'GET' }).then(
    (res) => res.json()
  );
  return res.data as string;
};
