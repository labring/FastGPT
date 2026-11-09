import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getDownloadCounts } from '../downloadCount';
import { compareVersions, pluginRepo } from '../plugin/repo';
import type { MarketplaceToolManifestSchemaType } from '../mongo/models/tool';

export type MarketplaceToolListDataItem = Omit<ToolDetailType, 'type'> & {
  type?: 'tool' | 'moderation';
  toolId: string;
  id: string;
  downloadCount: number;
  downloadUrl?: string;
  readme?: string;
  readmeUrls?: Partial<Record<localeType, string>>;
  parentId?: string;
  source?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var toolListData: MarketplaceToolListDataItem[];
  var expire: Date;
}

export const getToolVersionList = async (toolId?: string, type?: 'tool' | 'moderation') => {
  const displayRecords = await (type
    ? pluginRepo.listToolVersionIndexes(toolId, type)
    : pluginRepo.listToolVersionIndexes(toolId));

  return displayRecords
    .sort((a, b) => {
      const pluginCompare = a.pluginId.localeCompare(b.pluginId);
      if (pluginCompare !== 0) return pluginCompare;
      return compareVersions(b.version, a.version);
    })
    .map((record) => ({
      toolId: record.pluginId,
      version: record.version,
      etag: record.etag,
      type: record.type
    }));
};

const getMarketplaceToolFromRecord = (
  record: MarketplaceToolManifestSchemaType,
  downloadCount: number
): MarketplaceToolListDataItem => {
  const tool = record.tool as ToolDetailType;

  return {
    ...tool,
    type: record.type,
    pluginId: record.pluginId,
    toolId: record.pluginId,
    id: record.pluginId,
    version: record.version,
    etag: record.etag,
    source: record.source,
    isLatestVersion: true,
    isToolset: record.type === 'tool' ? Boolean(tool.children?.length) : false,
    downloadCount,
    downloadUrl: record.downloadUrl,
    readme: record.readmeUrl,
    readmeUrl: record.readmeUrl,
    readmeUrls: record.readmeUrls ?? tool.readmeUrls
  } as MarketplaceToolListDataItem;
};

const getMarketplaceChildToolsFromRecord = (record: MarketplaceToolManifestSchemaType) => {
  if (record.type === 'moderation') return [];
  const tool = record.tool as ToolDetailType;

  return (tool.children ?? []).map((child) => {
    const toolId = `${record.pluginId}/${child.id}`;
    return {
      ...child,
      type: 'tool',
      pluginId: toolId,
      toolId,
      id: toolId,
      parentId: record.pluginId,
      version: record.version,
      etag: record.etag,
      source: record.source,
      icon: child.icon || tool.icon,
      author: tool.author,
      tags: tool.tags,
      readme: record.readmeUrl,
      readmeUrl: record.readmeUrl,
      readmeUrls: record.readmeUrls ?? tool.readmeUrls,
      isLatestVersion: true,
      isToolset: false,
      downloadUrl: record.downloadUrl,
      downloadCount: 0
    };
  }) as MarketplaceToolListDataItem[];
};

const getToolListFromRepo = async ({
  type,
  toolId,
  version,
  latestOnly = true
}: {
  type?: 'tool' | 'moderation';
  toolId?: string;
  version?: string;
  latestOnly?: boolean;
} = {}) => {
  const parsedRecords = await pluginRepo.listToolManifests({
    ...(toolId ? { toolId } : {}),
    ...(version ? { version } : {}),
    ...(type && type !== 'tool' ? { type } : {}),
    latestOnly
  });

  if (parsedRecords.length === 0) return [];

  const downloadCount = await getDownloadCounts();

  return parsedRecords.flatMap((record) => [
    getMarketplaceToolFromRecord(record, downloadCount.get(record.pluginId)?.downloadCount ?? 0),
    ...getMarketplaceChildToolsFromRecord(record)
  ]);
};

export const getToolList = async ({
  type,
  toolId,
  version
}: {
  type?: 'tool' | 'moderation';
  toolId?: string;
  version?: string;
} = {}) => {
  if (toolId || version) {
    return getToolListFromRepo({ type, toolId, version, latestOnly: false });
  }

  if (type === 'moderation') {
    return getToolListFromRepo({ type: 'moderation', latestOnly: true });
  }

  if (!global.toolListData || global.toolListData.length === 0 || global.expire < new Date()) {
    global.expire = new Date(Date.now() + 1000 * 10 * 60); // 10 minutes
    const tools = await getToolListFromRepo({ type: 'tool' });
    if (tools.length > 0) {
      global.toolListData = tools;
      return global.toolListData;
    }
    global.toolListData = [];
  }
  return global.toolListData;
};

export const refreshToolList = async () => {
  global.toolListData = [];
  global.expire = new Date(0);
  pluginRepo.invalidateToolCache();
};
