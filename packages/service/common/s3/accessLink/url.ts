import { stripUrlTrailingSlash } from '@fastgpt/global/common/string/url';
import { serviceEnv } from '../../../env';
import { getStorageFileDomain } from '../config/constants';
import { getSystemInstanceConfig } from '../../system/systemInstanceConfig/runtime';
import { S3_ACCESS_LINK_ROUTES } from './constants';
import { S3SignedDownloadAliasValueSchema } from './type';

type ParsedUrlPrefix = {
  origin: string;
  pathname: string;
};

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

const parseUrlPrefix = (rawUrl?: string): ParsedUrlPrefix | undefined => {
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

const extractSingleTrailingSegment = (pathname: string, prefixPath: string) => {
  const normalizedPrefix = prefixPath ? `${stripUrlTrailingSlash(prefixPath)}/` : '/';
  if (!pathname.startsWith(normalizedPrefix)) return '';

  const rest = pathname.slice(normalizedPrefix.length);
  if (!rest || rest.includes('/')) return '';

  return decodeURIComponent(rest);
};

const extractSignedAliasFromPrefixes = (pathname: string, prefixes: Iterable<string>) => {
  for (const prefixPath of prefixes) {
    const candidate = extractSingleTrailingSegment(pathname, prefixPath);
    if (candidate && S3SignedDownloadAliasValueSchema.safeParse(candidate).success) {
      return candidate;
    }
  }

  return '';
};

const getDownloadRoutePathVariants = (endpointPath: string, nextBasePath: string) => {
  return new Set<string>([
    `${endpointPath}${nextBasePath}${S3_ACCESS_LINK_ROUTES.download}`,
    `${endpointPath}${S3_ACCESS_LINK_ROUTES.download}`,
    `${nextBasePath}${S3_ACCESS_LINK_ROUTES.download}`,
    S3_ACCESS_LINK_ROUTES.download
  ]);
};

const getConfiguredDownloadRouteRules = () => {
  const nextBasePath = normalizePathPrefix(serviceEnv.NEXT_PUBLIC_BASE_URL);
  const publicPrefix = parseUrlPrefix(serviceEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX);
  const relativeRoutePrefixes = getDownloadRoutePathVariants('', nextBasePath);
  const originRoutePrefixes = new Map<string, Set<string>>();

  const addOriginRoutes = (origin: string, routes: Iterable<string>) => {
    const existing = originRoutePrefixes.get(origin) ?? new Set<string>();
    for (const route of routes) {
      existing.add(route);
    }
    originRoutePrefixes.set(origin, existing);
  };

  for (const domain of [getStorageFileDomain(), getSystemInstanceConfig().site.publicUrl]) {
    const domainPrefix = parseUrlPrefix(domain);
    const issuedRoutePrefix = parseUrlPrefix(
      `${buildS3AccessLinkEndpointUrl(domain)}${S3_ACCESS_LINK_ROUTES.download}`
    );
    if (!domainPrefix) continue;

    // 签发端保留 fileDomain / publicUrl 中的路径段，识别端复用同一端点规则避免带路径网关地址失配。
    const routeVariants = getDownloadRoutePathVariants(domainPrefix.pathname, nextBasePath);
    if (issuedRoutePrefix) {
      routeVariants.add(issuedRoutePrefix.pathname);
    }

    addOriginRoutes(domainPrefix.origin, routeVariants);
    for (const route of routeVariants) {
      relativeRoutePrefixes.add(route);
    }
  }

  if (publicPrefix) {
    addOriginRoutes(publicPrefix.origin, getDownloadRoutePathVariants('', nextBasePath));
  }

  return {
    nextBasePath,
    publicPrefix,
    relativeRoutePrefixes,
    originRoutePrefixes
  };
};

/**
 * 仅从当前实例的下载路由或已配置的 `FILE_DOWNLOAD_PUBLIC_URL_PREFIX` 提取 signed alias。
 *
 * 与 `buildS3AccessLinkDownloadUrl` 共享含路径的端点规则（兼容带路径前缀的 `storage.fileDomain`
 * 与 `site.publicUrl`），同时不会把任意外部 URL 末段误判为本实例短链，避免外部 CDN 上恰巧命中
 * `v2-...` 形状的文件在进入外链读取前因本地验签失败而被拒绝。
 */
export const resolveS3DownloadAliasFromUrl = (url: string) => {
  try {
    const isRelativeUrl = url.startsWith('/') && !url.startsWith('//');
    const parsedUrl = new URL(url, 'http://localhost:3000');
    const { nextBasePath, publicPrefix, relativeRoutePrefixes, originRoutePrefixes } =
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

    // 2. 当前实例下载路由：[domainPath][NEXT_PUBLIC_BASE_URL]/api/system/file/d/{signedAlias}
    if (isRelativeUrl) {
      return extractSignedAliasFromPrefixes(parsedUrl.pathname, relativeRoutePrefixes);
    }

    if (originRoutePrefixes.size === 0) {
      return extractSignedAliasFromPrefixes(
        parsedUrl.pathname,
        getDownloadRoutePathVariants('', nextBasePath)
      );
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
