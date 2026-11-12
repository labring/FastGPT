import type { NextApiRequest, NextApiResponse } from 'next';
import { responseWriteController } from '@fastgpt/service/common/response';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { resolveReadableCollectionIds } from '@fastgpt/service/support/permission/collection/auth';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  checkExportDatasetLimit,
  updateExportDatasetLimit
} from '@fastgpt/service/support/user/utils';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import {
  datasetDataSystemIndexTypes,
  getDatasetDataExternalIndexes
} from '@fastgpt/global/core/dataset/data/utils';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { ExportDatasetQuerySchema } from '@fastgpt/global/openapi/core/dataset/api';
import { isDisableSuperAdmin } from '@fastgpt/global/core/dataset/apiDataset/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

type DataItemType = {
  _id: string;
  q: string;
  a: string;
  indexes: DatasetDataSchemaType['indexes'];
  metadata?: Record<string, any>;
};

type ExportSchemaType = {
  maxIndexCount?: number;
  hasMetadata?: number;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { datasetId } = parseApiInput({ req, querySchema: ExportDatasetQuerySchema }).query;

  // 凭证校验
  const { tmbId, dataset, isRoot } = await authDataset({
    req,
    authToken: true,
    datasetId,
    per: WritePermissionVal
  });
  // 资源范围以 dataset 归属为准：root 可以跨团队，用 header 的 teamId 会查不到数据。
  const datasetTeamId = String(dataset.teamId);

  // 目录不支持导出：其子知识库可能有独立权限，目录权限无法代表子知识库的读权限。
  if (dataset.type === DatasetTypeEnum.folder) {
    return Promise.reject(DatasetErrEnum.exportFolderNotSupported);
  }

  await checkExportDatasetLimit({
    teamId: datasetTeamId,
    limitMinutes: global.feConfigs?.limit?.exportDatasetLimitMinutes
  });

  // 文件级权限：只导出当前成员可读的 Collection；undefined 表示无需过滤（团队 owner /
  // 未启用 collection 权限）。
  // root 可读全部 Collection（与列表、collection 鉴权短路一致），这里返回的 isRoot 已按
  // disableSuperAdmin 折成有效值，开关开启时 root 仍必须走文件 ACL。
  // disableSuperAdmin 时团队 owner 也必须按文件 ACL 收敛，否则导出会成为绕过文件权限的旁路。
  const readableCollectionIds = isRoot
    ? undefined
    : await resolveReadableCollectionIds({
        teamId: datasetTeamId,
        datasetIds: [String(dataset._id)],
        tmbId: String(tmbId),
        ignoreTeamOwner: isDisableSuperAdmin(dataset.apiDatasetServer)
      });

  const match = {
    teamId: new Types.ObjectId(datasetTeamId),
    datasetId: new Types.ObjectId(dataset._id),
    ...(readableCollectionIds
      ? { collectionId: { $in: readableCollectionIds.map((id) => new Types.ObjectId(id)) } }
      : {})
  };

  const [exportSchema] = await MongoDatasetData.aggregate<ExportSchemaType>(
    [
      { $match: match },
      { $limit: 50000 },
      {
        $project: {
          // 系统索引（default / imageEmbedding）不计入列数：它们由 q/a/图片自动生成，
          // 计入会让表头恒多出列，且回导时被当成用户索引重新写入。
          indexCount: {
            $size: {
              $filter: {
                input: { $ifNull: ['$indexes', []] },
                cond: { $not: { $in: ['$$this.type', datasetDataSystemIndexTypes] } }
              }
            }
          },
          hasMetadata: {
            $cond: [{ $eq: [{ $type: '$metadata' }, 'object'] }, 1, 0]
          }
        }
      },
      {
        $group: {
          _id: null,
          maxIndexCount: { $max: '$indexCount' },
          hasMetadata: { $max: '$hasMetadata' }
        }
      }
    ],
    { ...readFromSecondary }
  );

  const indexCount = exportSchema?.maxIndexCount || 0;
  const hasMetadata = exportSchema?.hasMetadata === 1;
  const headers = [
    'q',
    'a',
    ...Array.from({ length: indexCount }, () => 'index'),
    ...(hasMetadata ? ['metadata'] : [])
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${encodeURIComponent(dataset.name)}-backup.csv;`
  );

  const cursor = MongoDatasetData.find<DataItemType>(match, 'q a indexes metadata', {
    ...readFromSecondary
  })
    .limit(50000)
    .cursor();

  const write = responseWriteController({
    res,
    readStream: cursor
  });

  write(`\uFEFF${headers.join(',')}`);

  cursor.on('data', (doc: DataItemType) => {
    const sanitizedQ = sanitizeCsvField(doc.q || '');
    const sanitizedA = sanitizeCsvField(doc.a || '');
    const exportIndexes = getDatasetDataExternalIndexes(doc.indexes);
    const sanitizedIndexes = Array.from({ length: indexCount }, (_, index) =>
      sanitizeCsvField(exportIndexes[index]?.text || '')
    );
    const sanitizedMetadata = hasMetadata
      ? [sanitizeCsvField(doc.metadata ? JSON.stringify(doc.metadata) : '')]
      : [];

    write(`\n${[sanitizedQ, sanitizedA, ...sanitizedIndexes, ...sanitizedMetadata].join(',')}`);
  });

  cursor.on('end', () => {
    cursor.close();
    res.end();
  });

  cursor.on('error', (err) => {
    logger.error(`export dataset error`, { error: err });
    res.status(500);
    res.end();
  });

  updateExportDatasetLimit(datasetTeamId);
}

export default NextAPI(handler);

export const config = {
  api: {
    responseLimit: '100mb'
  }
};
