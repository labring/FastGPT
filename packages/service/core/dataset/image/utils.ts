import { createFileToken } from '../../../support/permission/controller';

export const generateImagePreviewUrlServer = async (
  imageId: string,
  datasetId: string,
  teamId: string,
  uid: string,
  scene: 'list' | 'chat' | 'preview' = 'list'
) => {
  try {
    const expireMinutes = scene === 'chat' ? 7 * 24 * 60 : 30; // chat: 7 days, Other: 30 minutes

    const token = await createFileToken({
      bucketName: 'dataset',
      teamId,
      uid,
      fileId: imageId,
      customExpireMinutes: expireMinutes
    });

    if (!token) {
      throw new Error('Failed to get token');
    }

    const url = `/api/core/dataset/image/${imageId}?token=${token}`;

    return url;
  } catch (error) {
    return '';
  }
};
