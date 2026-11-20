import { stripUrlTrailingSlash } from '@fastgpt/global/common/string/url';
import { serviceEnv } from '../../../env';
import { getStorageFileDomain } from '../config/constants';
import { getSystemInstanceConfig } from '../../system/systemInstanceConfig/runtime';
import { S3_ACCESS_LINK_ROUTES } from './constants';
import { S3SignedDownloadAliasValueSchema } from './type';

const getS3AccessLinkEndpointUrl = () => {
  const domain = getStorageFileDomain() || getSystemInstanceConfig().site.publicUrl;

  return `${stripUrlTrailingSlash(domain)}${serviceEnv.NEXT_PUBLIC_BASE_URL}`;
};

const extractSingleTrailingSegment = (pathname: string, prefixPath: string) => {
  const normalizedPrefix = prefixPath ? `${stripUrlTrailingSlash(prefixPath)}/` : '/';
  if (!pathname.startsWith(normalizedPrefix)) return '';

  const rest = pathname.slice(normalizedPrefix.length);
  if (!rest || rest.includes('/')) return '';

  return decodeURIComponent(rest);
};

const getConfiguredDownloadOrigins = () => {
  const origins = new Set<string>();
  for (const candidate of [
    getStorageFileDomain(),
    getSystemInstanceConfig().site.publicUrl,
    serviceEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX
  ]) {
    if (!candidate) continue;
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      // Ignore invalid configured URL.
    }
  }
  return origins;
};

/**
 * 仅从当前实例的下载路由或已配置的 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX` 提取 signed alias。
 *
 * 不会把任意外部 URL 末段误判为本实例短链，避免外部 CDN 上恰巧命中 `v2-...` 形状的文件
 * 在进入外链读取前因本地验签失败而被拒绝。
 */
export const resolveS3DownloadAliasFromUrl = (url: string) => {
  try {
    const isRelativeUrl = url.startsWith('/') && !url.startsWith('//');
    const parsedUrl = new URL(url, 'http://localhost:3000');

    // 1. 已配置公开短路径前缀：{FILE_DOWNLOAD_PUBLIC_URL_PREFIX}/{signedAlias}
    if (!isRelativeUrl && serviceEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX) {
      const publicPrefixUrl = (() => {
        try {
          return new URL(stripUrlTrailingSlash(serviceEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX));
        } catch {
          return;
        }
      })();
      if (publicPrefixUrl && parsedUrl.origin === publicPrefixUrl.origin) {
        const prefixCandidate = extractSingleTrailingSegment(
          parsedUrl.pathname,
          stripUrlTrailingSlash(publicPrefixUrl.pathname)
        );
        if (S3SignedDownloadAliasValueSchema.safeParse(prefixCandidate).success) {
          return prefixCandidate;
        }
      }
    }

    // 2. 当前实例默认下载路由：[NEXT_PUBLIC_BASE_URL]/api/system/file/d/{signedAlias}
    const baseUrl = stripUrlTrailingSlash(serviceEnv.NEXT_PUBLIC_BASE_URL || '');
    const routePrefixes = baseUrl
      ? [`${baseUrl}${S3_ACCESS_LINK_ROUTES.download}`, S3_ACCESS_LINK_ROUTES.download]
      : [S3_ACCESS_LINK_ROUTES.download];

    const routeCandidate = (() => {
      for (const routePrefix of routePrefixes) {
        const candidate = extractSingleTrailingSegment(parsedUrl.pathname, routePrefix);
        if (candidate) return candidate;
      }
      return '';
    })();

    if (!routeCandidate || !S3SignedDownloadAliasValueSchema.safeParse(routeCandidate).success) {
      return '';
    }

    if (isRelativeUrl) {
      return routeCandidate;
    }

    const configuredOrigins = getConfiguredDownloadOrigins();
    if (configuredOrigins.size === 0 || configuredOrigins.has(parsedUrl.origin)) {
      return routeCandidate;
    }

    return '';
  } catch {
    return '';
  }
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
