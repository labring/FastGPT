import { getDatasetImagePreviewUrl } from '../image/utils';
import type { DatasetCiteItemType, DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';

export const formatDatasetDataValue = ({
  q,
  a,
  imageId,
  teamId,
  datasetId
}: {
  q: string;
  a?: string;
  imageId?: string;
  teamId: string;
  datasetId: string;
}): {
  q: string;
  a?: string;
  imagePreivewUrl?: string;
} => {
  if (!imageId) {
    return {
      q,
      a
    };
  }

  const previewUrl = getDatasetImagePreviewUrl({
    imageId,
    teamId,
    datasetId,
    expiredMinutes: 60 * 24 * 7 // 7 days
  });

  return {
    q: `![${q.replaceAll('\n', '\\n')}](${previewUrl})`,
    a,
    imagePreivewUrl: previewUrl
  };
};

export const getFormatDatasetCiteList = (list: DatasetDataSchemaType[]) => {
  return list.map<DatasetCiteItemType>((item) => ({
    _id: item._id,
    ...formatDatasetDataValue({
      teamId: item.teamId,
      datasetId: item.datasetId,
      q: item.q,
      a: item.a,
      imageId: item.imageId
    }),
    history: item.history,
    updateTime: item.updateTime,
    index: item.chunkIndex
  }));
};
