import { replaceS3KeyToPreviewUrl } from '../../../core/dataset/utils';
import { addEndpointToImageUrl } from '../../../common/file/image/utils';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { addDays } from 'date-fns';
import { isS3ObjectKey } from '../../../common/s3/utils';
import { S3Buckets } from '../../../common/s3/config/constants';
import { matchDatasetDataMarkdownImages } from './utils';
import { createS3DownloadAccessUrl } from '../../../common/s3/accessLink';

export const formatDatasetDataValue = async ({
  q,
  a,
  imageId,
  imageDescMap
}: {
  q: string;
  a?: string;
  imageId?: string;
  imageDescMap?: Record<string, string>;
}): Promise<{
  q: string;
  a?: string;
  imagePreivewUrl?: string;
}> => {
  // Add image description to image markdown
  if (imageDescMap) {
    // Helper function to replace image markdown with description
    const replaceImageMarkdown = (text: string): string => {
      const matches = matchDatasetDataMarkdownImages(text);
      let content = text;

      for (const item of matches.slice().reverse()) {
        const description = imageDescMap[item.url];
        if (description) {
          // Add description to alt text, keeping original if exists
          const newAltText = item.alt ? `${item.alt} - ${description}` : description;
          const replacement = `![${newAltText.replace(/\n/g, '')}](${item.url})`;
          content =
            content.slice(0, item.index) +
            replacement +
            content.slice(item.index + item.raw.length);
        }
      }

      return content;
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
    const [replacedQ, replacedA] = await Promise.all([
      replaceS3KeyToPreviewUrl(q, addDays(new Date(), 90)),
      a ? replaceS3KeyToPreviewUrl(a, addDays(new Date(), 90)) : undefined
    ]);

    return {
      q: replacedQ,
      a: replacedA
    };
  }

  const imagePreivewUrl = isS3ObjectKey(imageId, 'dataset')
    ? await createS3DownloadAccessUrl({
        objectKey: imageId,
        bucketName: S3Buckets.private,
        expiredTime: addDays(new Date(), 90)
      })
    : imageId;

  return {
    q: `![${q.replaceAll('\n', '')}](${imagePreivewUrl})`,
    a,
    imagePreivewUrl
  };
};

export const getFormatDatasetCiteList = (list: DatasetDataSchemaType[]) => {
  return Promise.all(
    list.map(async (item) => ({
      _id: item._id,
      ...(await formatDatasetDataValue({
        q: item.q,
        a: item.a,
        imageId: item.imageId
      })),
      history: item.history,
      updateTime: item.updateTime,
      index: item.chunkIndex
    }))
  );
};
