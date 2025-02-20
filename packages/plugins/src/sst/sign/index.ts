import CryptoJS from 'crypto-js';

type Props = {
  timestamp: number;
  version: string;
  client_ip: string;
  app_id: string;
  key: string;
  params: string;
};

type Response = Promise<{
  timestamp: number;
  version: string;
  client_ip: string;
  app_id: string;
  result: string;
}>;

const config = {
  client_ip: '127.0.0.1',
  version: '1.0',
  key: 'Qquiooxx129kKRee'
};

// 获取时间戳
const getTimestamp = (): number => {
  return Date.now();
};

// 对象进行ASCII排序
const sortASCII = (obj: Record<string, any>): Record<string, any> => {
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, any> = {};
  for (const key of sortedKeys) {
    sortedObj[key] = obj[key];
  }
  return sortedObj;
};

// MD5加密
const getMd5 = (data: Record<string, any>, key: string): string => {
  const str: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    str.push(`${key}=${value}`);
  }
  let strs = str.join('&'); // 数组变字符串
  console.log(strs + '&key=' + key);

  return CryptoJS.MD5(strs + '&key=' + key)
    .toString()
    .toUpperCase();
};

// 获取签名
const main = async (props: Props): Response => {
  try {
    let { timestamp, version, client_ip, app_id, key, params } = props;

    //
    if (!client_ip) {
      client_ip = config.client_ip;
    }

    // 版本号
    if (!version) {
      version = config.version;
    }

    // 获取时间戳
    if (!timestamp || timestamp === 0) {
      timestamp = getTimestamp();
    }

    if (!key) {
      key = config.key;
    }

    // 签名
    const sign = {
      timestamp: timestamp,
      version: version,
      clientIp: client_ip,
      appId: app_id
    };

    let requestBody: string = '';

    try {
      requestBody = JSON.stringify(params);
    } catch (error) {
      requestBody = params;
    }

    const data = sortASCII({
      ...sign,
      requestBody
    });

    const result: string = getMd5(data, key);

    return {
      timestamp: timestamp,
      version: version,
      client_ip: client_ip,
      app_id: app_id,
      result: result
    };
  } catch (error) {
    throw new Error('生成随身厅签名信息异常', { cause: error });
  }
};

export default main;
