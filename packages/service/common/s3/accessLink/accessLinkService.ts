import { createS3AccessLinkService } from '@fastgpt-sdk/storage/access-link';
import { serviceEnv } from '../../../env';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  S3_ACCESS_LINK_ROUTES,
  S3_DOWNLOAD_ALIAS_ID_LENGTH,
  S3_UPLOAD_TOKEN_LENGTH
} from './constants';
import { mongoS3DownloadAliasStore } from './downloadAlias/store';
import { mongoS3UploadSessionStore } from './uploadSession/store';

const endpointUrl = `${serviceEnv.FILE_DOMAIN || serviceEnv.FE_DOMAIN || ''}${serviceEnv.NEXT_PUBLIC_BASE_URL}`;

export const s3AccessLinkService = createS3AccessLinkService({
  secret: serviceEnv.FILE_TOKEN_KEY,
  routes: {
    buildDownloadUrl: (signedAlias) =>
      `${endpointUrl}${S3_ACCESS_LINK_ROUTES.download}/${signedAlias}`,
    buildUploadUrl: (token) => `${endpointUrl}${S3_ACCESS_LINK_ROUTES.upload}/${token}`
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
