import { createS3AccessLinkService } from '@fastgpt-sdk/storage';
import { serviceEnv } from '../../../env';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { S3_DOWNLOAD_ALIAS_ID_LENGTH, S3_UPLOAD_TOKEN_LENGTH } from './constants';
import { mongoS3DownloadAliasStore } from './downloadAlias/store';
import { mongoS3UploadSessionStore } from './uploadSession/store';
import { buildS3AccessLinkDownloadUrl, buildS3AccessLinkUploadUrl } from './url';

export const s3AccessLinkService = createS3AccessLinkService({
  secret: serviceEnv.FILE_TOKEN_KEY,
  routes: {
    buildDownloadUrl: buildS3AccessLinkDownloadUrl,
    buildUploadUrl: buildS3AccessLinkUploadUrl
  },
  stores: {
    downloadAlias: mongoS3DownloadAliasStore,
    uploadSession: mongoS3UploadSessionStore
  },
  idGenerator: {
    aliasId: () => getNanoid(S3_DOWNLOAD_ALIAS_ID_LENGTH),
    uploadToken: () => getNanoid(S3_UPLOAD_TOKEN_LENGTH)
  },
  uploadSessionUsePolicy: 'mark-used'
});
