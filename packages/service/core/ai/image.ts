import { getImageBase64 } from '../../common/file/image/utils';
import { getS3DatasetSource } from '../../common/s3/sources/dataset';
import { isS3ObjectKey } from '../../common/s3/utils';

export const isValidImageEmbeddingSource = (imageUrl?: string) => {
  const url = imageUrl?.trim();
  if (!url) return false;

  if (url.startsWith('data:image/')) return true;
  if (isS3ObjectKey(url, 'dataset')) return true;
  if (isS3ObjectKey(url, 'temp')) return true;
  if (isS3ObjectKey(url, 'chat')) return true;
  if (/^https?:\/\//i.test(url)) return true;

  return false;
};

export async function normalizeImageToBase64(imageUrl: string) {
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }

  if (
    isS3ObjectKey(imageUrl, 'dataset') ||
    isS3ObjectKey(imageUrl, 'temp') ||
    isS3ObjectKey(imageUrl, 'chat')
  ) {
    return getS3DatasetSource().getDatasetBase64Image(imageUrl);
  }

  const { completeBase64 } = await getImageBase64(imageUrl);
  return completeBase64;
}

export const normalizeImageInputsToBase64 = async <T>({
  items,
  getImageUrl
}: {
  items: T[];
  getImageUrl: (item: T) => string;
}) => {
  const results = await Promise.all(
    items.map(async (item) => {
      const imageUrl = getImageUrl(item).trim();
      if (!isValidImageEmbeddingSource(imageUrl)) return;

      try {
        return {
          item,
          imageUrl: await normalizeImageToBase64(imageUrl)
        };
      } catch (error) {
        return;
      }
    })
  );

  return results.filter(Boolean) as { item: T; imageUrl: string }[];
};
