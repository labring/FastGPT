import { randomBytes } from 'crypto';
import {
  defaultUploadConfig,
  type UploadFileConfig,
  type PresignedUrlInput,
  type PresignedUrlResponse,
  FilePluginTypeEnum,
  PLUGIN_TYPE_TO_PATH_MAP
} from './config';
import { addLog } from '../../system/log';
import { ensureBucket } from '../../minio/init';
import { connectionMinio } from '../../minio/index';
import { inferContentType } from './utils';

let globalConfig: UploadFileConfig = defaultUploadConfig;

export const initFileUploadService = async (config?: Partial<UploadFileConfig>) => {
  globalConfig = { ...defaultUploadConfig, ...config };

  try {
    addLog.info(`Initializing upload bucket: ${globalConfig.bucket}`);
    await ensureBucket(globalConfig.bucket, true);
    addLog.info(`Upload bucket initialized successfully: ${globalConfig.bucket}`);
    return true;
  } catch (error) {
    addLog.error(`Failed to initialize upload bucket: ${globalConfig.bucket}`, error);
    throw error;
  }
};

const generateFileId = (): string => {
  return randomBytes(16).toString('hex');
};

export const generateDownloadUrl = (objectName: string, config: UploadFileConfig): string => {
  const pathParts = objectName.split('/');
  const encodedParts = pathParts.map((part) => encodeURIComponent(part));
  const encodedObjectName = encodedParts.join('/');
  return `${config.bucket}/${encodedObjectName}`;
};

//Generate a pre-signed URL for direct file upload
export const generatePresignedUrl = async (
  input: PresignedUrlInput
): Promise<PresignedUrlResponse> => {
  const currentConfig = { ...globalConfig };

  const fileId = generateFileId();
  const pluginType = input.pluginType || FilePluginTypeEnum.tool;
  const pluginPath = PLUGIN_TYPE_TO_PATH_MAP[pluginType];
  const objectName = `${pluginPath}/${fileId}/${input.filename}`;
  const contentType = input.contentType || inferContentType(input.filename);
  const maxSize = input.maxSize || currentConfig.maxFileSize;

  try {
    const policy = connectionMinio.newPostPolicy();

    policy.setBucket(currentConfig.bucket);
    policy.setKey(objectName);
    policy.setContentType(contentType);
    policy.setContentLengthRange(1, maxSize);
    policy.setExpires(new Date(Date.now() + 10 * 60 * 1000));

    const metadata = {
      'original-filename': encodeURIComponent(input.filename),
      'upload-time': new Date().toISOString(),
      'file-id': fileId,
      ...input.metadata
    };
    policy.setUserMetaData(metadata);

    const { postURL, formData } = await connectionMinio.presignedPostPolicy(policy);

    const response: PresignedUrlResponse = {
      fileId,
      objectName,
      uploadUrl: postURL,
      formData
    };

    return response;
  } catch (error) {
    addLog.error('Failed to generate presigned URL', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Promise.reject(`Failed to generate presigned URL: ${errorMessage}`);
  }
};

//Confirm the presigned URL upload is complete and save the file information to MongoDB
export const confirmPresignedUpload = async (objectName: string, size: string): Promise<string> => {
  try {
    const currentConfig = { ...globalConfig };
    const stat = await connectionMinio.statObject(currentConfig.bucket, objectName);

    if (stat.size !== Number(size)) {
      addLog.error(`File size mismatch. Expected: ${size}, Actual: ${stat.size}`);
      return Promise.reject(`File size mismatch. Expected: ${size}, Actual: ${stat.size}`);
    }

    const accessUrl = generateDownloadUrl(objectName, currentConfig);

    return accessUrl;
  } catch (error) {
    addLog.error('Failed to confirm presigned upload', error);
    return Promise.reject(`Failed to confirm presigned upload: ${error}`);
  }
};
