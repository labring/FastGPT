import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { getDownloadCounts } from '../downloadCount';

import {
  MongoMarketplaceTool,
  MarketplaceToolZodSchema,
  type MarketplaceToolSchemaType
} from '../mongo/models/tool';

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

export const compareVersions = (a: string, b: string) => {
  const aParts = a.split(/[.-]/).map((item) => Number(item));
  const bParts = b.split(/[.-]/).map((item) => Number(item));
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index++) {
    const aPart = aParts[index] ?? 0;
    const bPart = bParts[index] ?? 0;
    if (Number.isNaN(aPart) || Number.isNaN(bPart)) {
      return a.localeCompare(b);
    }
    if (aPart !== bPart) return aPart - bPart;
  }

  return 0;
};

const getLatestToolRecords = (records: MarketplaceToolSchemaType[]) => {
  const latestRecordMap = new Map<string, MarketplaceToolSchemaType>();

  for (const record of records) {
    const existing = latestRecordMap.get(record.pluginId);
    if (!existing || compareVersions(record.version, existing.version) > 0) {
      latestRecordMap.set(record.pluginId, record);
    }
  }

  return Array.from(latestRecordMap.values()).sort((a, b) => a.pluginId.localeCompare(b.pluginId));
};

export const getToolVersionList = async (toolId?: string) => {
  const records = await MongoMarketplaceTool.find({
    type: 'tool',
    ...(toolId ? { pluginId: toolId } : {})
  }).lean();
  const parsedRecords = records.map((record) => MarketplaceToolZodSchema.parse(record));
  const displayRecords = toolId ? parsedRecords : getLatestToolRecords(parsedRecords);

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
  record: MarketplaceToolSchemaType,
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
    source: 'system',
    isLatestVersion: true,
    isToolset: Boolean(tool.children?.length),
    downloadCount,
    downloadUrl: record.downloadUrl,
    readme: record.readmeUrl,
    readmeUrl: record.readmeUrl
  } as MarketplaceToolListDataItem;
};

const getMarketplaceChildToolsFromRecord = (record: MarketplaceToolSchemaType) => {
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
      source: 'system',
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

const getToolListFromMongo = async ({
  toolId,
  version,
  latestOnly = true
}: {
  toolId?: string;
  version?: string;
  latestOnly?: boolean;
} = {}) => {
  const records = await MongoMarketplaceTool.find({
    type: 'tool',
    ...(toolId ? { pluginId: toolId } : {}),
    ...(version ? { version } : {})
  }).lean();
  const parsedRecords = records.map((record) => MarketplaceToolZodSchema.parse(record));

  if (parsedRecords.length === 0) return [];

  const [downloadCount, latestRecords] = await Promise.all([
    getDownloadCounts(),
    Promise.resolve(latestOnly ? getLatestToolRecords(parsedRecords) : parsedRecords)
  ]);

  return latestRecords.flatMap((record) => [
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
    return getToolListFromMongo({ toolId, version, latestOnly: false });
  }

  if (!global.toolListData || global.toolListData.length === 0 || global.expire < new Date()) {
    global.expire = new Date(Date.now() + 1000 * 10 * 60); // 10 minutes
    const mongoTools = await getToolListFromMongo();
    if (mongoTools.length > 0) {
      global.toolListData = mongoTools;
      return global.toolListData;
    }
    global.toolListData = [];
  }
  return global.toolListData;
};

export const refreshToolList = async () => {
  global.toolListData = [];
  global.expire = new Date(0);
};
