import {
  createS3KeysPreviewUrlMap,
  getS3ObjectKeysFromMarkdownTexts,
  replaceS3KeysWithPreviewUrlMap
} from '../../../core/dataset/utils';
import { addEndpointToImageUrl } from '../../../common/file/image/utils';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { addDays } from 'date-fns';
import { isS3ObjectKey } from '../../../common/s3/utils';
import { matchDatasetDataMarkdownImages } from './utils';

type FormatDatasetDataValueProps = {
  q: string;
  a?: string;
  imageId?: string;
  imageDescMap?: Record<string, string>;
};

type FormattedDatasetDataValue = {
  q: string;
  a?: string;
  imagePreivewUrl?: string;
};

/**
 * 整理数据块的图片描述和图片 endpoint，不签发访问链接。
 * 搜索候选阶段使用该函数，确保去重、相似度和 token 过滤前没有 Mongo IO。
 */
export const formatDatasetDataTextValue = ({
  q,
  a,
  imageDescMap
}: Pick<FormatDatasetDataValueProps, 'q' | 'a' | 'imageDescMap'>) => {
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

  return { q, a };
};

/**
 * 批量格式化数据块，并让 q、a 与 imageId 中的重复对象键共用一次短链签发。
 */
export const formatDatasetDataValues = async (
  items: FormatDatasetDataValueProps[]
): Promise<FormattedDatasetDataValue[]> => {
  const normalizedItems = items.map(({ q, a, imageId, imageDescMap }) => ({
    ...formatDatasetDataTextValue({ q, a, imageDescMap }),
    imageId
  }));
  const markdownObjectKeys = getS3ObjectKeysFromMarkdownTexts(
    normalizedItems.flatMap((item) => (item.imageId ? [] : [item.q, item.a]))
  );
  const imageObjectKeys = normalizedItems.flatMap(({ imageId }) =>
    imageId && isS3ObjectKey(imageId, 'dataset') ? [imageId] : []
  );
  const previewUrlMap = await createS3KeysPreviewUrlMap({
    objectKeys: [...markdownObjectKeys, ...imageObjectKeys],
    expiredTime: addDays(new Date(), 90)
  });

  return normalizedItems.map(({ q, a, imageId }) => {
    if (!imageId) {
      return {
        q: replaceS3KeysWithPreviewUrlMap(q, previewUrlMap),
        a: a ? replaceS3KeysWithPreviewUrlMap(a, previewUrlMap) : undefined
      };
    }

    const imagePreivewUrl = isS3ObjectKey(imageId, 'dataset')
      ? previewUrlMap.get(imageId)!
      : imageId;

    return {
      q: `![${q.replaceAll('\n', '')}](${imagePreivewUrl})`,
      a,
      imagePreivewUrl
    };
  });
};

/** 单条数据格式化兼容入口，复用批量实现以保持签发语义一致。 */
export const formatDatasetDataValue = async (
  item: FormatDatasetDataValueProps
): Promise<FormattedDatasetDataValue> => {
  const [result] = await formatDatasetDataValues([item]);
  return result!;
};

export const getFormatDatasetCiteList = async (list: DatasetDataSchemaType[]) => {
  const formattedValues = await formatDatasetDataValues(
    list.map((item) => ({
      q: item.q,
      a: item.a,
      imageId: item.imageId
    }))
  );

  return list.map((item, index) => ({
    _id: item._id,
    ...formattedValues[index]!,
    history: item.history,
    updateTime: item.updateTime,
    index: item.chunkIndex
  }));
};
