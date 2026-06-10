export type MarketplaceDetailQuery = {
  pluginId?: string;
  version?: string;
};

export type MarketplacePageQuery = MarketplaceDetailQuery & {
  search?: string;
  tags?: string[];
};

export type NextQueryValue = string | string[] | undefined;

export const getSingleQueryValue = (value: NextQueryValue) => {
  const queryValue = Array.isArray(value) ? value[0] : value;
  const normalizedValue = queryValue?.trim();

  return normalizedValue || undefined;
};

export const buildMarketplaceQueryString = ({
  search,
  tags,
  pluginId,
  version
}: MarketplacePageQuery) => {
  const params: Array<[string, string]> = [];

  if (search) {
    params.push(['search', search]);
  }
  if (tags && tags.length > 0) {
    params.push(['tags', tags.join(',')]);
  }
  if (pluginId) {
    params.push(['pluginId', pluginId]);
  }
  if (pluginId && version) {
    params.push(['version', version]);
  }

  return params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
};

export const buildMarketplacePageUrl = ({
  pathname,
  ...query
}: MarketplacePageQuery & { pathname: string }) => {
  const queryString = buildMarketplaceQueryString(query);

  return queryString ? `${pathname}?${queryString}` : pathname;
};

export const getMarketplaceDetailQueryFromSearch = (search: string): MarketplaceDetailQuery => {
  const searchParams = new URLSearchParams(search);
  const pluginId = getSingleQueryValue(searchParams.get('pluginId') ?? undefined);

  if (!pluginId) return {};

  return {
    pluginId,
    version: getSingleQueryValue(searchParams.get('version') ?? undefined)
  };
};
