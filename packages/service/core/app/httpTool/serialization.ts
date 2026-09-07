/**
 * 将 OpenAPI 3 的单个非 Body 参数展开为有序键值对，保留 Query 重复键。
 * Query 值交给 URLSearchParams 编码；Path 只编码数据、不编码样式分隔符；Header 保留原文。
 * 仅支持标量、一维数组和浅对象；规范未定义的嵌套展开及非法样式明确报错。
 */
export const serializeOpenAPIParameter = ({
  location,
  name,
  style = location === 'query' ? 'form' : 'simple',
  explode = style === 'form',
  value
}: {
  location: string;
  name: string;
  style?: string;
  explode?: boolean;
  value: unknown;
}): [string, string][] => {
  const supportedStyles: Record<string, string[]> = {
    query: ['form', 'spaceDelimited', 'pipeDelimited', 'deepObject'],
    path: ['simple', 'label', 'matrix'],
    header: ['simple']
  };
  if (!supportedStyles[location]?.includes(style)) {
    throw new Error(`Unsupported OpenAPI ${location} parameter style: ${style}`);
  }

  // 不把嵌套对象默默转成 [object Object]，也不把 undefined 当成字符串发送。
  const scalar = (item: unknown): string => {
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'boolean' ||
      (typeof item === 'number' && Number.isFinite(item))
    ) {
      return String(item);
    }
    throw new Error(`Unsupported OpenAPI parameter value: ${name}`);
  };
  const encode = (item: unknown) => {
    const text = scalar(item);
    return location === 'path'
      ? encodeURIComponent(text).replace(
          /[!'()*]/g,
          (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
        )
      : text;
  };
  const array = Array.isArray(value) ? value.map(encode) : undefined;
  const object =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.entries(value).map(([key, item]) => [encode(key), encode(item)])
      : undefined;

  if (location === 'query') {
    if (style === 'deepObject') {
      if (!object || !explode) {
        throw new Error(`OpenAPI deepObject requires an object and explode=true: ${name}`);
      }
      return object.map(([key, item]) => [`${name}[${key}]`, item]);
    }
    if (style === 'spaceDelimited' || style === 'pipeDelimited') {
      if (!array || explode) {
        throw new Error(`OpenAPI ${style} requires an array and explode=false: ${name}`);
      }
      return [[name, array.join(style === 'spaceDelimited' ? ' ' : '|')]];
    }
    if (array) return explode ? array.map((item) => [name, item]) : [[name, array.join(',')]];
    if (object) {
      return explode ? object.map(([key, item]) => [key, item]) : [[name, object.flat().join(',')]];
    }
    return [[name, scalar(value)]];
  }

  const serialized = (() => {
    if (style === 'matrix') {
      const prefix = `;${encode(name)}=`;
      if (array) return prefix + array.join(explode ? prefix : ',');
      if (object) {
        return explode
          ? object.map(([key, item]) => `;${key}=${item}`).join('')
          : prefix + object.flat().join(',');
      }
      return prefix + encode(value);
    }
    const separator = style === 'label' && explode ? '.' : ',';
    const content = array
      ? array.join(separator)
      : object
        ? explode
          ? object.map(([key, item]) => `${key}=${item}`).join(separator)
          : object.flat().join(',')
        : encode(value);
    return (style === 'label' ? '.' : '') + content;
  })();
  // URL 会归一化独立的点路径段，不能让参数改变目标路径层级。
  if (location === 'path' && (serialized === '.' || serialized === '..')) {
    throw new Error(`Invalid OpenAPI path parameter: ${name}`);
  }
  return [[name, serialized]];
};
