import dayjs from 'dayjs';

/**
 * 对象转成 query 字符串
 */
export const Obj2Query = (obj: Record<string, string | number | null | undefined>) => {
  const queryParams = new URLSearchParams();
  for (const key in obj) {
    queryParams.append(key, `${obj[key]}`);
  }
  return queryParams.toString();
};

export const parseQueryString = (str: string) => {
  const queryObject: Record<string, string | string[]> = {};

  const splitStr = str.split('?');

  str = splitStr[1] || splitStr[0];

  // 将字符串按照 '&' 分割成键值对数组
  const keyValuePairs = str.split('&');

  // 遍历键值对数组，将每个键值对解析为对象的属性和值
  keyValuePairs.forEach((keyValuePair) => {
    const pair = keyValuePair.split('=');
    const key = decodeURIComponent(pair[0]);
    const value = decodeURIComponent(pair[1] || '');

    // 如果对象中已经存在该属性，则将值转换为数组
    if (Object.hasOwn(queryObject, key)) {
      if (!Array.isArray(queryObject[key])) {
        queryObject[key] = [queryObject[key]];
      }
      queryObject[key].push(value);
    } else {
      queryObject[key] = value;
    }
  });

  return queryObject;
};

export const throttle = <T extends (...args: any[]) => void>(func: T, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    if (!timeoutId) {
      timeoutId = setTimeout(() => {
        func(...args);
        timeoutId = undefined!;
      }, delay);
    }
  };
};

export function formatDate(
  date?: string | number | Date | dayjs.Dayjs | null | undefined,
  format = 'YYYY-MM-DD HH:mm'
) {
  return dayjs(date).format(format);
}
