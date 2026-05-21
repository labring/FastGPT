export function normalizePathPrefix(path: string): string {
  if (!path) return '';

  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : '';
}

export function joinUrlPath(url: string, path: string): string {
  const normalizedPath = normalizePathPrefix(path);
  return normalizedPath ? `${url.replace(/\/+$/, '')}${normalizedPath}` : url.replace(/\/+$/, '');
}
