import mongoose, { Types } from 'mongoose';
import fs from 'fs';
import fsp from 'fs/promises';
import { ERROR_ENUM } from '../errorCode';
import type { GSFileInfoType } from '@/types/common/file';

enum BucketNameEnum {
  dataset = 'dataset'
}

export class GridFSStorage {
  readonly type = 'gridfs';
  readonly bucket: `${BucketNameEnum}`;
  readonly uid: string;

  constructor(bucket: `${BucketNameEnum}`, uid: string) {
    this.bucket = bucket;
    this.uid = String(uid);
  }
  Collection() {
    return mongoose.connection.db.collection(`${this.bucket}.files`);
  }
  GridFSBucket() {
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: this.bucket
    });
  }

  async save({
    path,
    filename,
    metadata = {}
  }: {
    path: string;
    filename: string;
    metadata?: Record<string, any>;
  }) {
    if (!path) return Promise.reject(`filePath is empty`);
    if (!filename) return Promise.reject(`filename is empty`);

    const stats = await fsp.stat(path);
    if (!stats.isFile()) return Promise.reject(`${path} is not a file`);

    metadata.userId = this.uid;
    // create a gridfs bucket
    const bucket = this.GridFSBucket();

    const stream = bucket.openUploadStream(filename, {
      metadata,
      contentType: metadata?.contentType
    });

    // save to gridfs
    await new Promise((resolve, reject) => {
      fs.createReadStream(path)
        .pipe(stream as any)
        .on('finish', resolve)
        .on('error', reject);
    });

    return String(stream.id);
  }
  async findAndAuthFile(id: string): Promise<GSFileInfoType> {
    if (!id) {
      return Promise.reject(`id is empty`);
    }

    // create a gridfs bucket
    const bucket = this.GridFSBucket();

    // check if file exists
    const files = await bucket.find({ _id: new Types.ObjectId(id) }).toArray();
    const file = files.shift();
    if (!file) {
      return Promise.reject(`file not found`);
    }

    if (file.metadata?.userId !== this.uid) {
      return Promise.reject(ERROR_ENUM.unAuthFile);
    }

    return {
      id: String(file._id),
      filename: file.filename,
      contentType: file.metadata?.contentType,
      encoding: file.metadata?.encoding,
      uploadDate: file.uploadDate,
      size: file.length
    };
  }

  async delete(id: string) {
    await this.findAndAuthFile(id);
    const bucket = this.GridFSBucket();

    await bucket.delete(new Types.ObjectId(id));
    return true;
  }

  async deleteFilesByKbId(kbId: string) {
    if (!kbId) return;
    const bucket = this.GridFSBucket();
    const files = await bucket
      .find({ ['metadata.kbId']: kbId, ['metadata.userId']: this.uid }, { projection: { _id: 1 } })
      .toArray();

    return Promise.all(files.map((file) => this.delete(String(file._id))));
  }

  async download(id: string) {
    await this.findAndAuthFile(id);

    const bucket = this.GridFSBucket();

    const stream = bucket.openDownloadStream(new Types.ObjectId(id));

    const buf: Buffer = await new Promise((resolve, reject) => {
      const buffers: Buffer[] = [];
      stream.on('data', (data) => buffers.push(data));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(buffers)));
    });

    return buf;
  }
}
