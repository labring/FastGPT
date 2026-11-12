import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import type { SqlFullTextRow } from '../../../../common/vectorDB/fullText/type';
import { getDatasetSynonymConfig, getDatasetSynonymMatcher } from '../../synonym/entity';

/** 按索引记录的历史同义词版本重建输入，图片全文为空；不能用当前词表猜测历史。 */
export const buildSqlFullTextRows = async (
  data: DatasetDataSchemaType
): Promise<SqlFullTextRow[]> => {
  const teamId = String(data.teamId);
  const datasetId = String(data.datasetId);
  const version = data.synonymVersion ?? 0;
  // 图片没有全文输入，明确的版本 0 也不依赖词表；迁移不能额外要求这些历史快照。
  const needsHistory =
    data.indexes.some((index) => index.type !== DatasetDataIndexTypeEnum.imageEmbedding) &&
    (data.synonymVersion === undefined || version > 0);
  const config = needsHistory ? await getDatasetSynonymConfig({ teamId, datasetId }) : null;
  if (data.synonymVersion === undefined && config && config.version > 0) {
    throw new Error('Historical synonym version is missing; rebuild this data before migrating');
  }
  const matcher =
    needsHistory && version > 0 && !(config?.version === version && !config.enabled)
      ? await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: version })
      : undefined;
  if (matcher && !matcher.hasMappings)
    throw new Error('Historical synonym snapshot is unavailable');
  return data.indexes.map((index) => ({
    vectorId: index.dataId,
    teamId,
    datasetId,
    collectionId: String(data.collectionId),
    text:
      index.type === DatasetDataIndexTypeEnum.imageEmbedding
        ? ''
        : (matcher?.transform(index.text).transformedText ?? index.text)
  }));
};
