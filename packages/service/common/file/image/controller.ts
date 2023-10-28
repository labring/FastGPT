import { imageBaseUrl } from './constant';
import { MongoImage } from './schema';

export function getMongoImgUrl(id: string) {
  return `${imageBaseUrl}${id}`;
}

export async function uploadMongoImg({ base64Img, userId }: { base64Img: string; userId: string }) {
  const base64Data = base64Img.split(',')[1];

  const { _id } = await MongoImage.create({
    userId,
    binary: Buffer.from(base64Data, 'base64')
  });

  return getMongoImgUrl(String(_id));
}

export async function readMongoImg({ id }: { id: string }) {
  const data = await MongoImage.findById(id);
  if (!data) {
    return Promise.reject('Image not found');
  }
  return data?.binary;
}
