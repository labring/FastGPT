import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { getDownloadCounts } from '../downloadCount';
import { compareVersions, pluginRepo } from '../plugin/repo';
import type { MarketplaceToolManifestSchemaType } from '../mongo/models/tool';

export type MarketplaceToolListDataItem = ToolDetailType & {
  toolId: string;
  id: string;
  downloadCount: number;
  downloadUrl?: string;
  readme?: string;
  parentId?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var toolListData: MarketplaceToolListDataItem[];
  var expire: Date;
}

export const getToolVersionList = async (toolId?: string) => {
  const displayRecords = await pluginRepo.listToolVersionIndexes(toolId);

  return displayRecords
    .sort((a, b) => {
      const pluginCompare = a.pluginId.localeCompare(b.pluginId);
      if (pluginCompare !== 0) return pluginCompare;
      return compareVersions(b.version, a.version);
    })
    .map((record) => ({
      toolId: record.pluginId,
      version: record.version,
      etag: record.etag
    }));
};

const getMarketplaceToolFromRecord = (
  record: MarketplaceToolManifestSchemaType,
  downloadCount: number
): MarketplaceToolListDataItem => {
  const tool = record.tool as ToolDetailType;

  return {
    ...tool,
    pluginId: record.pluginId,
    toolId: record.pluginId,
    id: record.pluginId,
    version: record.version,
    etag: record.etag,
    source: record.source,
    isLatestVersion: true,
    isToolset: Boolean(tool.children?.length),
    downloadCount,
    downloadUrl: record.downloadUrl,
    readme: record.readmeUrl,
    readmeUrl: record.readmeUrl
  } as MarketplaceToolListDataItem;
};

const getMarketplaceChildToolsFromRecord = (record: MarketplaceToolManifestSchemaType) => {
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
      isLatestVersion: true,
      isToolset: false,
      downloadUrl: record.downloadUrl,
      downloadCount: 0
    };
  }) as MarketplaceToolListDataItem[];
};

const getToolListFromRepo = async ({
  toolId,
  version,
  latestOnly = true
}: {
  toolId?: string;
  version?: string;
  latestOnly?: boolean;
} = {}) => {
  const parsedRecords = await pluginRepo.listToolManifests({
    toolId,
    version,
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
  toolId,
  version
}: {
  toolId?: string;
  version?: string;
} = {}) => {
  if (toolId || version) {
    return getToolListFromRepo({ toolId, version, latestOnly: false });
  }

  if (!global.toolListData || global.toolListData.length === 0 || global.expire < new Date()) {
    global.expire = new Date(Date.now() + 1000 * 10 * 60); // 10 minutes
    const tools = await getToolListFromRepo();
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
