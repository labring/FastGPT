import { POST } from '@/web/common/api/request';

/**
 * Get file access token
 */
export const postGetFileToken = (data: {
  bucketName: string;
  fileId: string;
  datasetId?: string;
  teamId?: string;
  expireMinutes?: number;
}) => {
  // Filter out undefined values but keep empty strings
  const filteredData = Object.fromEntries(
    Object.entries(data).filter(([_, value]) => value !== undefined)
  );

  return POST('/common/file/token', filteredData, {
    timeout: 10000
  });
};

export const generateImagePreviewUrl = async (
  imageId: string,
  datasetId: string,
  scene: 'list' | 'chat' | 'preview' = 'list'
) => {
  try {
    if (!imageId) {
      return '';
    }

    // Set different expiration times based on scene
    const expireMinutes = scene === 'chat' ? 7 * 24 * 60 : 30;

    const tokenData = {
      bucketName: 'dataset',
      fileId: imageId,
      datasetId,
      expireMinutes
    };

    const token = await postGetFileToken(tokenData);

    const timestamp = Date.now();
    const url = `/api/core/dataset/image/${imageId}?token=${token}&t=${timestamp}`;

    return url;
  } catch (error) {
    return '';
  }
};
