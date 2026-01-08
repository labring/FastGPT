import { type preUploadImgProps } from '@fastgpt/global/common/file/api';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { MongoImage } from './schema';
import { type ClientSession, Types } from '../../../common/mongo';
import { guessBase64ImageType } from './utils';
import { readFromSecondary } from '../../mongo/utils';
import { addHours } from 'date-fns';
import { imageFileType } from '@fastgpt/global/common/file/constants';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getS3AvatarSource } from '../../s3/sources/avatar';
import { isS3ObjectKey } from '../../s3/utils';
import path from 'path';
import { getNanoid } from '@fastgpt/global/common/string/tools';

export const maxImgSize = 1024 * 1024 * 12;
const base64MimeRegex = /data:image\/([^\)]+);base64/;

export async function uploadMongoImg({
  base64Img,
  teamId,
  metadata,
  shareId,
  forever = false
}: preUploadImgProps & {
  base64Img: string;
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

export const copyAvatarImage = async ({
  teamId,
  imageUrl,
  temporary,
  session
}: {
  teamId: string;
  imageUrl: string;
  temporary: boolean;
  session?: ClientSession;
}) => {
  if (!imageUrl) return;

  const avatarSource = getS3AvatarSource();
  if (isS3ObjectKey(imageUrl?.slice(avatarSource.prefix.length), 'avatar')) {
    const filename = (() => {
      const last = imageUrl.split('/').pop();
      if (!last) return getNanoid(6).concat(path.extname(imageUrl));
      const firstDashIndex = last.indexOf('-');
      return `${getNanoid(6)}-${firstDashIndex === -1 ? last : last.slice(firstDashIndex + 1)}`;
    })();
    const key = await getS3AvatarSource().copyAvatar({
      key: imageUrl,
      teamId,
      filename,
      temporary
    });
    return key;
  }

  const paths = imageUrl.split('/');
  const name = paths[paths.length - 1];
  const id = name.split('.')[0];

  // Mongo
  if (id && Types.ObjectId.isValid(id)) {
    const image = await MongoImage.findOne(
      {
        _id: id,
        teamId
      },
      undefined,
      {
        session
      }
    );
    if (!image) return imageUrl;
    const [newImage] = await MongoImage.create(
      [
        {
          teamId,
          binary: image.binary,
          metadata: image.metadata
        }
      ],
      {
        session,
        ordered: true
      }
    );
    return `${process.env.NEXT_PUBLIC_BASE_URL || ''}${imageBaseUrl}${String(newImage._id)}.${image.metadata?.mime?.split('/')[1]}`;
  }

  return imageUrl;
};

export const removeImageByPath = (path?: string, session?: ClientSession) => {
  if (!path) return;

  const paths = path.split('/');
  const name = paths[paths.length - 1];

  if (!name) return;

  const id = name.split('.')[0];
  if (!id) return;

  if (Types.ObjectId.isValid(id)) {
    return MongoImage.deleteOne({ _id: id }, { session });
  } else if (isS3ObjectKey(path?.slice(getS3AvatarSource().prefix.length), 'avatar')) {
    return getS3AvatarSource().deleteAvatar(path, session);
  }
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
