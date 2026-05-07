import { getImageBase64 } from '../../common/file/image/utils';
import { getS3DatasetSource } from '../../common/s3/sources/dataset';
import { isS3ObjectKey } from '../../common/s3/utils';

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
