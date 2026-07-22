/** 将对象 key 编码为 URL path，同时保留对象存储使用的 `/` 层级分隔符。 */
export const encodeObjectKeyPath = (key: string): string =>
  key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
