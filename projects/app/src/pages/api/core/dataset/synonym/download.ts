import type { ApiRequestProps } from '@fastgpt/next/type';
import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { DownloadDatasetSynonymQuerySchema } from '@fastgpt/global/openapi/core/dataset/synonym/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoDatasetSynonym } from '@fastgpt/service/core/dataset/synonym/schema';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  assertDatasetSynonymEnabled,
  getDatasetSynonymMappings
} from '@fastgpt/service/core/dataset/synonym/entity';
import { serializeSynonymMappingsToFile } from '@fastgpt/service/core/dataset/synonym/utils';

async function handler(req: ApiRequestProps, res: NextApiResponse) {
  assertDatasetSynonymEnabled();

  const { id } = parseApiInput({ req, querySchema: DownloadDatasetSynonymQuerySchema }).query;
  const config = await MongoDatasetSynonym.findById(id).lean();
  if (!config?.enabled) throw new Error('同义词配置不存在');
  const { teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: String(config.datasetId),
    per: ReadPermissionVal
  });
  if (String(config.teamId) !== teamId) throw new Error('无权下载该同义词文件');

  const mappings = await getDatasetSynonymMappings({
    teamId,
    datasetId: String(config.datasetId),
    fileVersion: config.version
  });
  // 下载格式跟随上传格式（验收问题 1）：xlsx/xls 重新生成工作簿，csv 才回 CSV。
  const rawExtension = config.fileName?.match(/\.(\w+)$/)?.[1]?.toLowerCase();
  const extension =
    rawExtension === 'xlsx' || rawExtension === 'xls' || rawExtension === 'csv'
      ? rawExtension
      : 'csv';
  const baseName = (config.fileName ?? 'synonyms.csv').replace(/\.(xlsx?|csv)$/i, '');
  const { buffer, contentType } = serializeSynonymMappingsToFile(mappings, extension);
  const fileName = `${baseName}.${extension}`;
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
  );
  res.end(buffer);
}

export default NextAPI(handler);
