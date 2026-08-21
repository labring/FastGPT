import { stripUrlTrailingSlash } from '@fastgpt/global/common/string/url';
import { serviceEnv } from '../../../env';
import { S3_ACCESS_LINK_ROUTES } from './constants';

const getS3AccessLinkEndpointUrl = () => {
  const domain = serviceEnv.FILE_DOMAIN ?? serviceEnv.FE_DOMAIN ?? '';

  return `${stripUrlTrailingSlash(domain)}${serviceEnv.NEXT_PUBLIC_BASE_URL}`;
};

/**
 * 构造对外暴露的 S3 下载短链。
 *
 * 当配置 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX` 时，下载链接直接使用该公开前缀，
 * 由 nginx 将 `{signedAlias}` rewrite 到 app 的下载 API；未配置时保持旧的 FastGPT API 路径。
 */
export const buildS3AccessLinkDownloadUrl = (signedAlias: string) => {
  if (serviceEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX) {
    return `${stripUrlTrailingSlash(serviceEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX)}/${signedAlias}`;
  }

  return `${getS3AccessLinkEndpointUrl()}${S3_ACCESS_LINK_ROUTES.download}/${signedAlias}`;
};

/**
 * 构造对外暴露的 S3 上传短链。
 *
 * 上传链路需要保留完整 API 路径，以承接请求体、大小限制、内容校验和 abort 语义。
 */
export const buildS3AccessLinkUploadUrl = (token: string) => {
  return `${getS3AccessLinkEndpointUrl()}${S3_ACCESS_LINK_ROUTES.upload}/${token}`;
};
