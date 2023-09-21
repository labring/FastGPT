import crypto from 'crypto';
import dayjs from 'dayjs';

/**
 * 密码加密
 */
export const createHashPassword = (text: string) => {
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  return hash;
};

/**
 * 对象转成 query 字符串
 */
export const Obj2Query = (obj: Record<string, string | number>) => {
  const queryParams = new URLSearchParams();
  for (const key in obj) {
    queryParams.append(key, `${obj[key]}`);
  }
  return queryParams.toString();
};

/**
 * parse string to query object
 */
export const parseQueryString = (str: string) => {
  const queryObject: Record<string, any> = {};

  const splitStr = str.split('?');

  str = splitStr[1] || splitStr[0];

  // 将字符串按照 '&' 分割成键值对数组
  const keyValuePairs = str.split('&');

  // 遍历键值对数组，将每个键值对解析为对象的属性和值
  keyValuePairs.forEach(function (keyValuePair) {
    const pair = keyValuePair.split('=');
    const key = decodeURIComponent(pair[0]);
    const value = decodeURIComponent(pair[1] || '');

    // 如果对象中已经存在该属性，则将值转换为数组
    if (queryObject.hasOwnProperty(key)) {
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

/**
 * 格式化时间成聊天格式
 */
export const formatTimeToChatTime = (time: Date) => {
  const now = dayjs();
  const target = dayjs(time);

  // 如果传入时间小于60秒，返回刚刚
  if (now.diff(target, 'second') < 60) {
    return '刚刚';
  }

  // 如果时间是今天，展示几时:几秒
  if (now.isSame(target, 'day')) {
    return target.format('HH:mm');
  }

  // 如果是昨天，展示昨天
  if (now.subtract(1, 'day').isSame(target, 'day')) {
    return '昨天';
  }

  // 如果是前天，展示前天
  if (now.subtract(2, 'day').isSame(target, 'day')) {
    return '前天';
  }

  // 如果是今年，展示某月某日
  if (now.isSame(target, 'year')) {
    return target.format('M月D日');
  }

  // 如果是更久之前，展示某年某月某日
  return target.format('YYYY/M/D');
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getErrText = (err: any, def = '') => {
  const msg: string = typeof err === 'string' ? err : err?.message || def || '';
  msg && console.log('error =>', msg);
  return msg;
};

export const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });
