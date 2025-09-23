import { addEndpointToImageUrl } from '../../../common/file/image/utils';
import { getDatasetImagePreviewUrl } from '../image/utils';
import type { DatasetCiteItemType, DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';

export const formatDatasetDataValue = ({
  teamId,
  datasetId,
  q,
  a,
  imageId,
  imageDescMap
}: {
  teamId: string;
  datasetId: string;
  q: string;
  a?: string;
  imageId?: string;
  imageDescMap?: Record<string, string>;
}): {
  q: string;
  a?: string;
  imagePreivewUrl?: string;
} => {
  // Add image description to image markdown
  if (imageDescMap) {
    // Helper function to replace image markdown with description
    const replaceImageMarkdown = (text: string): string => {
      return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, altText, url) => {
        const description = imageDescMap[url];
        if (description) {
          // Add description to alt text, keeping original if exists
          const newAltText = altText ? `${altText} - ${description}` : description;
          return `![${newAltText.replace(/\n/g, '')}](${url})`;
        }
        return match; // Return original if no description found
      });
    };

    // Apply replacement to both q and a
    q = replaceImageMarkdown(q);
    if (a) {
      a = replaceImageMarkdown(a);
    }
  }

  // Add image base url
  q = addEndpointToImageUrl(q);
  if (a) {
    a = addEndpointToImageUrl(a);
  }

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
    q: `![${q.replaceAll('\n', '')}](${previewUrl})`,
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
