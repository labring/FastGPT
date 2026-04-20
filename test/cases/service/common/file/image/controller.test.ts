import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  uploadMongoImg,
  maxImgSize,
  readMongoImg,
  removeImageByPath,
  delImgByRelatedId,
  copyAvatarImage
} from '@fastgpt/service/common/file/image/controller';
import { MongoImage } from '@fastgpt/service/common/file/image/schema';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';

const teamId = new Types.ObjectId().toString();

describe('uploadMongoImg', () => {
  beforeEach(async () => {
    await MongoImage.deleteMany({});
  });

  it('should upload a valid JPEG base64 image', async () => {
    // Minimal valid JPEG base64
    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const base64Data = binary.toString('base64');
    const base64Img = `data:image/jpeg;base64,${base64Data}`;

    const result = await uploadMongoImg({
      base64Img,
      teamId
    });

    expect(result).toContain(imageBaseUrl);
    expect(result).toContain('.jpeg');

    // Verify saved in DB
    const images = await MongoImage.find({ teamId });
    expect(images.length).toBe(1);
    expect(images[0].metadata?.mime).toBe('image/jpeg');
  });

  it('should upload a valid PNG base64 image', async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const base64Data = binary.toString('base64');
    const base64Img = `data:image/png;base64,${base64Data}`;

    const result = await uploadMongoImg({
      base64Img,
      teamId
    });

    expect(result).toContain('.png');
  });

  it('should reject image exceeding max size', async () => {
    const largeBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(maxImgSize + 1);

    await expect(
      uploadMongoImg({
        base64Img: largeBase64,
        teamId
      })
    ).rejects.toThrow('Image too large');
  });

  it('should reject invalid base64 mime', async () => {
    const base64Img = 'invalid-mime,AAAA';

    await expect(
      uploadMongoImg({
        base64Img,
        teamId
      })
    ).rejects.toThrow('Invalid image base64');
  });

  it('should reject invalid image file type', async () => {
    const base64Img = 'data:image/faketype;base64,AAAA';

    await expect(
      uploadMongoImg({
        base64Img,
        teamId
      })
    ).rejects.toThrow('Invalid image file type');
  });

  it('should handle x- prefix in extension', async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const base64Data = binary.toString('base64');
    // x-png should have x- stripped to become "png"
    const base64Img = `data:image/x-png;base64,${base64Data}`;

    const result = await uploadMongoImg({
      base64Img,
      teamId
    });

    expect(result).toContain('.png');
  });

  it('should set expiredTime when forever is false', async () => {
    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const base64Data = binary.toString('base64');
    const base64Img = `data:image/jpeg;base64,${base64Data}`;

    await uploadMongoImg({
      base64Img,
      teamId,
      forever: false
    });

    const image = await MongoImage.findOne({ teamId });
    expect(image?.expiredTime).toBeDefined();
  });

  it('should not set expiredTime when forever is true', async () => {
    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const base64Data = binary.toString('base64');
    const base64Img = `data:image/jpeg;base64,${base64Data}`;

    await uploadMongoImg({
      base64Img,
      teamId,
      forever: true
    });

    const image = await MongoImage.findOne({ teamId });
    expect(image?.expiredTime).toBeUndefined();
  });

  it('should include NEXT_PUBLIC_BASE_URL in result when set', async () => {
    const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    process.env.NEXT_PUBLIC_BASE_URL = '/sub';

    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const base64Data = binary.toString('base64');
    const base64Img = `data:image/jpeg;base64,${base64Data}`;

    const result = await uploadMongoImg({
      base64Img,
      teamId
    });

    expect(result).toContain(imageBaseUrl);

    process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
  });
});

describe('readMongoImg', () => {
  beforeEach(async () => {
    await MongoImage.deleteMany({});
  });

  it('should read an existing image by id', async () => {
    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const image = await MongoImage.create({
      teamId,
      binary,
      metadata: { mime: 'image/jpeg' }
    });

    const result = await readMongoImg({ id: String(image._id) });
    expect(result.mime).toBe('image/jpeg');
    expect(Buffer.isBuffer(result.binary)).toBe(true);
  });

  it('should strip file extension from id', async () => {
    const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const image = await MongoImage.create({
      teamId,
      binary,
      metadata: { mime: 'image/png' }
    });

    const result = await readMongoImg({ id: `${String(image._id)}.png` });
    expect(result.mime).toBe('image/png');
  });

  it('should reject when image not found', async () => {
    const fakeId = new Types.ObjectId().toString();
    await expect(readMongoImg({ id: fakeId })).rejects.toThrow('Image not found');
  });

  it('should guess mime type when metadata.mime is missing', async () => {
    const jpegBinary = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const image = await MongoImage.create({
      teamId,
      binary: jpegBinary,
      metadata: {}
    });

    const result = await readMongoImg({ id: String(image._id) });
    // guessBase64ImageType should detect JPEG from the binary
    expect(result.mime).toBeDefined();
  });
});

describe('removeImageByPath', () => {
  beforeEach(async () => {
    await MongoImage.deleteMany({});
  });

  it('should return undefined for empty path', async () => {
    const result = removeImageByPath('');
    expect(result).toBeUndefined();
  });

  it('should return undefined for undefined path', async () => {
    const result = removeImageByPath(undefined);
    expect(result).toBeUndefined();
  });

  it('should return undefined when name is empty', async () => {
    const result = removeImageByPath('/some/path/');
    expect(result).toBeUndefined();
  });

  it('should return undefined when id part is empty', async () => {
    const result = removeImageByPath('/some/path/.png');
    expect(result).toBeUndefined();
  });

  it('should delete image from MongoDB when id is valid ObjectId', async () => {
    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const image = await MongoImage.create({
      teamId,
      binary,
      metadata: { mime: 'image/jpeg' }
    });

    await removeImageByPath(`/api/system/img/${String(image._id)}.jpeg`);

    const found = await MongoImage.findById(image._id);
    expect(found).toBeNull();
  });
});

describe('delImgByRelatedId', () => {
  beforeEach(async () => {
    await MongoImage.deleteMany({});
  });

  it('should return early when relateIds is empty', async () => {
    const result = await delImgByRelatedId({
      teamId,
      relateIds: []
    });
    expect(result).toBeUndefined();
  });

  it('should delete images by relatedId', async () => {
    const relatedId = 'related-123';
    await MongoImage.create([
      {
        teamId,
        binary: Buffer.from([0xff]),
        metadata: { mime: 'image/jpeg', relatedId }
      },
      {
        teamId,
        binary: Buffer.from([0xff]),
        metadata: { mime: 'image/png', relatedId }
      },
      {
        teamId,
        binary: Buffer.from([0xff]),
        metadata: { mime: 'image/gif', relatedId: 'other' }
      }
    ]);

    await delImgByRelatedId({
      teamId,
      relateIds: [relatedId]
    });

    const remaining = await MongoImage.find({ teamId });
    expect(remaining.length).toBe(1);
    expect(remaining[0].metadata?.relatedId).toBe('other');
  });
});

describe('copyAvatarImage', () => {
  beforeEach(async () => {
    await MongoImage.deleteMany({});
  });

  it('should return undefined for empty imageUrl', async () => {
    const result = await copyAvatarImage({
      teamId,
      imageUrl: '',
      temporary: false
    });
    expect(result).toBeUndefined();
  });

  it('should copy a MongoDB image and return new URL', async () => {
    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const image = await MongoImage.create({
      teamId,
      binary,
      metadata: { mime: 'image/jpeg' }
    });

    const imageUrl = `${imageBaseUrl}${String(image._id)}.jpeg`;
    const result = await copyAvatarImage({
      teamId,
      imageUrl,
      temporary: false
    });

    expect(result).toContain(imageBaseUrl);
    // Should be a different image (new _id)
    expect(result).not.toBe(imageUrl);

    // Should have 2 images now
    const images = await MongoImage.find({ teamId });
    expect(images.length).toBe(2);
  });

  it('should return original URL when MongoDB image not found', async () => {
    const fakeId = new Types.ObjectId().toString();
    const imageUrl = `${imageBaseUrl}${fakeId}.jpeg`;

    const result = await copyAvatarImage({
      teamId,
      imageUrl,
      temporary: false
    });

    expect(result).toBe(imageUrl);
  });

  it('should return original URL for non-ObjectId URLs', async () => {
    const imageUrl = 'https://example.com/some-image.png';

    const result = await copyAvatarImage({
      teamId,
      imageUrl,
      temporary: false
    });

    expect(result).toBe(imageUrl);
  });
});
