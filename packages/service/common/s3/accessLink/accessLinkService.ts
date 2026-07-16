import { createS3AccessLinkService } from '@fastgpt-sdk/storage';
import { serviceEnv } from '../../../env';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { S3_DOWNLOAD_ALIAS_ID_LENGTH, S3_UPLOAD_TOKEN_LENGTH } from './constants';
import { mongoS3DownloadAliasStore } from './downloadAlias/store';
import { mongoS3UploadSessionStore } from './uploadSession/store';
import { buildS3AccessLinkDownloadUrl, buildS3AccessLinkUploadUrl } from './url';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.S3);
const roundDurationMs = (durationMs: number) => Number(durationMs.toFixed(3));

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
  onDownloadUrlTiming: (timing) => {
    logger.debug('S3 short download URL issued', {
      totalDurationMs: roundDurationMs(timing.totalDurationMs),
      hmacDurationMs: roundDurationMs(timing.hmacDurationMs),
      aliasKeyHmacDurationMs: roundDurationMs(timing.aliasKeyHmacDurationMs),
      signatureHmacDurationMs: roundDurationMs(timing.signatureHmacDurationMs),
      mongoIoDurationMs: roundDurationMs(timing.storeIoDurationMs),
      mongoFindDurationMs: roundDurationMs(timing.storeFindDurationMs),
      mongoCreateDurationMs: roundDurationMs(timing.storeCreateDurationMs),
      mongoTouchLeaseDurationMs: roundDurationMs(timing.storeTouchLeaseDurationMs),
      aliasReused: timing.aliasReused,
      duplicateAliasRetry: timing.duplicateAliasRetry,
      leaseTouched: timing.leaseTouched
    });
  },
  uploadSessionUsePolicy: 'mark-used'
});
