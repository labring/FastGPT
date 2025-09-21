import { Client } from 'minio';
import {
  type FileMetadataType,
  type PresignedUrlInput as UploadPresignedURLProps,
  type UploadPresignedURLResponse,
  type S3ServiceConfig
} from './type';
import { defualtS3Config } from './config';
import { randomBytes } from 'crypto';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { extname } from 'path';
import { addLog } from '../../common/system/log';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { mimeMap } from './const';

export class S3Service {
  private client: Client;
  private config: S3ServiceConfig;
  private initialized: boolean = false;
  initFunction?: () => Promise<any>;

  constructor(config?: Partial<S3ServiceConfig>) {
    this.config = { ...defualtS3Config, ...config } as S3ServiceConfig;

    this.client = new Client({
      endPoint: this.config.endPoint,
      port: this.config.port,
      useSSL: this.config.useSSL,
      accessKey: this.config.accessKey,
      secretKey: this.config.secretKey,
      transportAgent: process.env.HTTP_PROXY
        ? new HttpProxyAgent(process.env.HTTP_PROXY)
        : process.env.HTTPS_PROXY
          ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
          : undefined
    });

    this.initFunction = config?.initFunction;
  }

  public async init() {
    if (!this.initialized) {
      if (!(await this.client.bucketExists(this.config.bucket))) {
        addLog.debug(`Creating bucket: ${this.config.bucket}`);
        await this.client.makeBucket(this.config.bucket);
      }

      await this.initFunction?.();
      this.initialized = true;
    }
  }

  private generateFileId(): string {
    return randomBytes(16).toString('hex');
  }

  private generateAccessUrl(filename: string): string {
    const protocol = this.config.useSSL ? 'https' : 'http';
    const port =
      this.config.port && this.config.port !== (this.config.useSSL ? 443 : 80)
        ? `:${this.config.port}`
        : '';

    const externalBaseURL = this.config.externalBaseURL;
    return externalBaseURL
      ? `${externalBaseURL}/${this.config.bucket}/${encodeURIComponent(filename)}`
      : `${protocol}://${this.config.endPoint}${port}/${this.config.bucket}/${encodeURIComponent(filename)}`;
  }

  uploadFile = async (fileBuffer: Buffer, originalFilename: string): Promise<FileMetadataType> => {
    await this.init();
    const inferContentType = (filename: string) => {
      const ext = extname(filename).toLowerCase();
      return mimeMap[ext] || 'application/octet-stream';
    };

    if (this.config.maxFileSize && fileBuffer.length > this.config.maxFileSize) {
      return Promise.reject(
        `File size ${fileBuffer.length} exceeds limit ${this.config.maxFileSize}`
      );
    }

    const fileId = this.generateFileId();
    const objectName = `${fileId}-${originalFilename}`;
    const uploadTime = new Date();

    const contentType = inferContentType(originalFilename);
    await this.client.putObject(this.config.bucket, objectName, fileBuffer, fileBuffer.length, {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(originalFilename)}"`,
      'x-amz-meta-original-filename': encodeURIComponent(originalFilename),
      'x-amz-meta-upload-time': uploadTime.toISOString()
    });

    const metadata: FileMetadataType = {
      fileId,
      originalFilename,
      contentType,
      size: fileBuffer.length,
      uploadTime,
      accessUrl: this.generateAccessUrl(objectName)
    };

    return metadata;
  };

  generateUploadPresignedURL = async ({
    filepath,
    contentType,
    metadata,
    filename
  }: UploadPresignedURLProps): Promise<UploadPresignedURLResponse> => {
    await this.init();
    const objectName = `${filepath}/${filename}`;

    try {
      const policy = this.client.newPostPolicy();

      policy.setBucket(this.config.bucket);
      policy.setKey(objectName);
      if (contentType) {
        policy.setContentType(contentType);
      }
      if (this.config.maxFileSize) {
        policy.setContentLengthRange(1, this.config.maxFileSize);
      }
      policy.setExpires(new Date(Date.now() + 10 * 60 * 1000)); // 10 mins

      policy.setUserMetaData({
        'original-filename': encodeURIComponent(filename),
        'upload-time': new Date().toISOString(),
        ...metadata
      });

      const { postURL, formData } = await this.client.presignedPostPolicy(policy);

      const response: UploadPresignedURLResponse = {
        objectName,
        uploadUrl: postURL,
        formData
      };

      return response;
    } catch (error) {
      addLog.error('Failed to generate Upload Presigned URL', error);
      return Promise.reject(`Failed to generate Upload Presigned URL: ${getErrText(error)}`);
    }
  };

  generateDownloadUrl = (objectName: string): string => {
    const pathParts = objectName.split('/');
    const encodedParts = pathParts.map((part) => encodeURIComponent(part));
    const encodedObjectName = encodedParts.join('/');
    return `${this.config.bucket}/${encodedObjectName}`;
  };

  getFile = async (objectName: string): Promise<string> => {
    const stat = await this.client.statObject(this.config.bucket, objectName);

    if (stat.size > 0) {
      const accessUrl = this.generateDownloadUrl(objectName);
      return accessUrl;
    }

    return Promise.reject(`File ${objectName} not found`);
  };
}
