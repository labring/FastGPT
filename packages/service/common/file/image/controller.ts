import { type UploadImgProps } from '@fastgpt/global/common/file/api';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { MongoImage } from './schema';
import { type ClientSession, Types } from '../../../common/mongo';
import { guessBase64ImageType } from '../utils';
import { readFromSecondary } from '../../mongo/utils';
import { addHours } from 'date-fns';
import { imageFileType } from '@fastgpt/global/common/file/constants';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { UserError } from '@fastgpt/global/common/error/utils';

export const maxImgSize = 1024 * 1024 * 12;
const base64MimeRegex = /data:image\/([^\)]+);base64/;

export async function uploadMongoImg({
  base64Img,
  teamId,
  metadata,
  shareId,
  forever = false
}: UploadImgProps & {
  teamId: string;
  forever?: Boolean;
}) {
  if (base64Img.length > maxImgSize) {
    return Promise.reject(new UserError('Image too large'));
  }

  const [base64Mime, base64Data] = base64Img.split(',');
  // Check if mime type is valid
  if (!base64MimeRegex.test(base64Mime)) {
    return Promise.reject(new UserError('Invalid image base64'));
  }

  const mime = `image/${base64Mime.match(base64MimeRegex)?.[1] ?? 'image/jpeg'}`;
  const binary = Buffer.from(base64Data, 'base64');
  let extension = mime.split('/')[1];
  if (extension.startsWith('x-')) {
    extension = extension.substring(2); // Remove 'x-' prefix
  }

  if (!extension || !imageFileType.includes(`.${extension}`)) {
    return Promise.reject(new UserError(`Invalid image file type: ${mime}`));
  }

  const { _id } = await retryFn(() =>
    MongoImage.create({
      teamId,
      binary,
      metadata: Object.assign({ mime }, metadata),
      shareId,
      expiredTime: forever ? undefined : addHours(new Date(), 1)
    })
  );

  return `${process.env.NEXT_PUBLIC_BASE_URL || ''}${imageBaseUrl}${String(_id)}.${extension}`;
}

const getIdFromPath = (path?: string) => {
  if (!path) return;

  const paths = path.split('/');
  const name = paths[paths.length - 1];

  if (!name) return;

  const id = name.split('.')[0];
  if (!id || !Types.ObjectId.isValid(id)) return;

  return id;
};
// 删除旧的头像，新的头像去除过期时间
export const refreshSourceAvatar = async (
  path?: string,
  oldPath?: string,
  session?: ClientSession
) => {
  const newId = getIdFromPath(path);
  const oldId = getIdFromPath(oldPath);

  if (!newId || newId === oldId) return;

  await MongoImage.updateOne({ _id: newId }, { $unset: { expiredTime: 1 } }, { session });

  if (oldId) {
    await MongoImage.deleteOne({ _id: oldId }, { session });
  }
};
export const removeImageByPath = (path?: string, session?: ClientSession) => {
  if (!path) return;

  const paths = path.split('/');
  const name = paths[paths.length - 1];

  if (!name) return;

  const id = name.split('.')[0];
  if (!id || !Types.ObjectId.isValid(id)) return;

  return MongoImage.deleteOne({ _id: id }, { session });
};

export async function readMongoImg({ id }: { id: string }) {
  const formatId = id.replace(/\.[^/.]+$/, '');

  const data = await MongoImage.findById(formatId, undefined, {
    ...readFromSecondary
  });
  if (!data) {
    return Promise.reject(new UserError('Image not found'));
  }

  return {
    binary: data.binary,
    mime: data.metadata?.mime ?? guessBase64ImageType(data.binary.toString('base64'))
  };
}

export async function delImgByRelatedId({
  teamId,
  relateIds,
  session
}: {
  teamId: string;
  relateIds: string[];
  session?: ClientSession;
}) {
  if (relateIds.length === 0) return;

  return MongoImage.deleteMany(
    {
      teamId,
      'metadata.relatedId': { $in: relateIds.map((id) => String(id)) }
    },
    { session }
  );
}
