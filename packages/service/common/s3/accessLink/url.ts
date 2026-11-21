import { stripUrlTrailingSlash } from '@fastgpt/global/common/string/url';
import { parseSignedS3DownloadAlias } from '@fastgpt-sdk/storage/access-link';
import { serviceEnv } from '../../../env';
import { getStorageFileDomain } from '../config/constants';
import { getSystemInstanceConfig } from '../../system/systemInstanceConfig/runtime';
import { S3_ACCESS_LINK_ROUTES } from './constants';
import { S3SignedDownloadAliasValueSchema } from './type';

const normalizePathPrefix = (value?: string) => {
  const stripped = stripUrlTrailingSlash(value?.trim());
  if (!stripped) return '';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
};

const buildS3AccessLinkEndpointUrl = (domain?: string) => {
  const normalizedDomain = stripUrlTrailingSlash(domain?.trim());
  const nextBasePath = normalizePathPrefix(serviceEnv.NEXT_PUBLIC_BASE_URL);

  return `${normalizedDomain}${nextBasePath}`;
};

const getS3AccessLinkEndpointUrl = () => {
  const domain = getStorageFileDomain() || getSystemInstanceConfig().site.publicUrl;

  return buildS3AccessLinkEndpointUrl(domain);
};

const extractSignedAliasFromPrefixes = (pathname: string, prefixes: Iterable<string>) => {
  const extractSingleTrailingSegment = (prefixPath: string) => {
    const normalizedPrefix = prefixPath ? `${stripUrlTrailingSlash(prefixPath)}/` : '/';
    if (!pathname.startsWith(normalizedPrefix)) return '';

    const rest = pathname.slice(normalizedPrefix.length);
    if (!rest || rest.includes('/')) return '';

    return decodeURIComponent(rest);
  };

  for (const prefixPath of prefixes) {
    const candidate = extractSingleTrailingSegment(prefixPath);
    if (candidate && S3SignedDownloadAliasValueSchema.safeParse(candidate).success) {
      return candidate;
    }
  }

  return '';
};

const getConfiguredDownloadRouteRules = () => {
  const parseUrlPrefix = (rawUrl?: string) => {
    const normalized = stripUrlTrailingSlash(rawUrl?.trim());
    if (!normalized) return;

    try {
      const parsed = new URL(normalized);
      return {
        origin: parsed.origin,
        pathname: stripUrlTrailingSlash(parsed.pathname)
      };
    } catch {
      return;
    }
  };

  const nextBasePath = normalizePathPrefix(serviceEnv.NEXT_PUBLIC_BASE_URL);
  const defaultAppRoutePath = `${nextBasePath}${S3_ACCESS_LINK_ROUTES.download}`;
  const publicPrefix = parseUrlPrefix(serviceEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX);
  const relativeRoutePrefixes = new Set<string>([defaultAppRoutePath]);
  const originRoutePrefixes = new Map<string, Set<string>>();

  for (const domain of [getStorageFileDomain(), getSystemInstanceConfig().site.publicUrl]) {
    if (!domain?.trim()) continue;
    // 与 buildS3AccessLinkDownloadUrl 共用同一完整端点规则，避免把同网关下其他服务的相邻路径误判为本实例。
    const issuedRoutePrefix = parseUrlPrefix(
      `${buildS3AccessLinkEndpointUrl(domain)}${S3_ACCESS_LINK_ROUTES.download}`
    );
    if (!issuedRoutePrefix) continue;

    const existing = originRoutePrefixes.get(issuedRoutePrefix.origin) ?? new Set<string>();
    existing.add(issuedRoutePrefix.pathname);
    originRoutePrefixes.set(issuedRoutePrefix.origin, existing);
    relativeRoutePrefixes.add(issuedRoutePrefix.pathname);
  }

  return {
    publicPrefix,
    relativeRoutePrefixes,
    originRoutePrefixes
  };
};

/**
 * 仅从当前实例的下载路由或已配置的 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX` 提取 signed alias。
 *
 * 与 `buildS3AccessLinkDownloadUrl` 共享含路径的完整端点规则（兼容带路径前缀的 `storage.fileDomain`
 * 与 `site.publicUrl`）：相对路径匹配本实例下载路由；绝对 URL 必须精确命中已配置的公开端点。
 * 未配置任何公开域名或短路径前缀时，本实例只签发相对链接，不对任意外部 origin 的绝对 URL 做归属猜测，
 * 避免把其他 FastGPT 实例或外部 CDN 的 v2 链接误送本地验签而阻断外链读取。
 */
export const resolveS3DownloadAliasFromUrl = (url: string) => {
  try {
    const isRelativeUrl = url.startsWith('/') && !url.startsWith('//');
    const parsedUrl = new URL(url, 'http://localhost:3000');
    const { publicPrefix, relativeRoutePrefixes, originRoutePrefixes } =
      getConfiguredDownloadRouteRules();

    // 1. 已配置公开短路径前缀：{FILE_DOWNLOAD_PUBLIC_URL_PREFIX}/{signedAlias}
    if (!isRelativeUrl && publicPrefix && parsedUrl.origin === publicPrefix.origin) {
      const prefixCandidate = extractSignedAliasFromPrefixes(parsedUrl.pathname, [
        publicPrefix.pathname
      ]);
      if (prefixCandidate) {
        return prefixCandidate;
      }
    }

    // 2. 当前实例完整下载路由：[domainPath][NEXT_PUBLIC_BASE_URL]/api/system/file/d/{signedAlias}
    if (isRelativeUrl) {
      return extractSignedAliasFromPrefixes(parsedUrl.pathname, relativeRoutePrefixes);
    }

    const allowedRoutes = originRoutePrefixes.get(parsedUrl.origin);
    if (!allowedRoutes) {
      return '';
    }

    return extractSignedAliasFromPrefixes(parsedUrl.pathname, allowedRoutes);
  } catch {
    return '';
  }
};

/**
 * 识别跨实例的存量 v1 点分短链（`<aliasId>.<expMinute36>.<sig>`）。
 * v1 的末段是 22 位签名而非扩展名，读取边界需显式剥离以免误判为未知扩展名或覆盖远端真实文件名。
 */
export const isLegacyV1SignedDownloadAlias = (value?: string): boolean => {
  if (!value) return false;

  try {
    return parseSignedS3DownloadAlias(value).version === 'v1';
  } catch {
    return false;
  }
};

/**
 * 判断从链接提取出的文件名片段是否属于不可作为真实文件名的短链凭证：
 * 仅命中本实例短链路由（含 v1/v2）或跨实例旧 v1 点分格式时返回 true；
 * 外部 CDN 上形如 `v2-...pdf` 的普通文件与跨实例 v2 链接保留真实文件名及后缀。
 */
export const isSignedDownloadAliasFilename = ({
  url,
  filename,
  localSignedAlias
}: {
  url: string;
  filename?: string;
  localSignedAlias?: string;
}): boolean => {
  if (!filename) return false;
  if (isLegacyV1SignedDownloadAlias(filename)) return true;

  const resolvedAlias = localSignedAlias ?? resolveS3DownloadAliasFromUrl(url);
  return Boolean(resolvedAlias) && filename === resolvedAlias;
};

/**
 * 构造对外暴露的 S3 下载短链。
 *
 * 当配置 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX` 时，下载链接直接使用该公开前缀，
 * 由 nginx 将 `{signedAlias}` rewrite 到 app 的下载 API；未配置时保持旧的 FastGPT API 路径。
 */
export const buildS3AccessLinkDownloadUrl = (signedAlias: string) => {
  const publicPrefix = stripUrlTrailingSlash(serviceEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX?.trim());
  if (publicPrefix) {
    return `${publicPrefix}/${signedAlias}`;
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
