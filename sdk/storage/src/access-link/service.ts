import { createDefaultIdGenerator, createS3AccessLinkCrypto } from './crypto';
import {
  createDownloadUrlHandler,
  deleteDownloadAliasByObjectHandler,
  deleteDownloadAliasByObjectsHandler,
  revokeDownloadAliasHandler,
  verifyDownloadAliasHandler
} from './download';
import {
  createUploadUrlHandler,
  revokeUploadTokenHandler,
  verifyUploadTokenHandler
} from './upload';
import type {
  CreateS3AccessLinkServiceOptions,
  ResolvedS3AccessLinkServiceOptions,
  S3AccessLinkService
} from './types';

const resolveOptions = (
  options: CreateS3AccessLinkServiceOptions
): ResolvedS3AccessLinkServiceOptions => {
  const defaultIdGenerator = createDefaultIdGenerator();

  if (!options.secret) {
    throw new Error('S3 access link secret is required');
  }

  return {
    ...options,
    clock: options.clock ?? (() => new Date()),
    idGenerator: {
      aliasId: options.idGenerator?.aliasId ?? defaultIdGenerator.aliasId,
      uploadToken: options.idGenerator?.uploadToken ?? defaultIdGenerator.uploadToken
    },
    uploadSessionUsePolicy: options.uploadSessionUsePolicy ?? 'mark-used'
  };
};

/**
 * Creates a runtime-independent access-link service.
 *
 * The returned service owns only protocol behavior. Database writes, URL shape,
 * and route/proxy handling are provided by the caller through ports.
 */
export const createS3AccessLinkService = (
  options: CreateS3AccessLinkServiceOptions
): S3AccessLinkService => {
  const resolvedOptions = resolveOptions(options);
  const crypto = createS3AccessLinkCrypto({ secret: resolvedOptions.secret });
  const deps = { ...resolvedOptions, crypto };

  return {
    createDownloadUrl: createDownloadUrlHandler(deps),
    verifyDownloadAlias: verifyDownloadAliasHandler(deps),
    revokeDownloadAlias: revokeDownloadAliasHandler(deps),
    deleteDownloadAliasByObject: deleteDownloadAliasByObjectHandler(deps),
    deleteDownloadAliasByObjects: deleteDownloadAliasByObjectsHandler(deps),
    createUploadUrl: createUploadUrlHandler(deps),
    verifyUploadToken: verifyUploadTokenHandler(deps),
    revokeUploadToken: revokeUploadTokenHandler(deps)
  };
};
