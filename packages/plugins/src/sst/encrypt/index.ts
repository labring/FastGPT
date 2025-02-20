import CryptoJS from 'crypto-js';

type Props = {
  params: string;
  key: string;
  iv: string;
};

type Response = Promise<{
  result: string;
}>;

const config = {
  key: '24ac25e04d9d8e2da25549dc94ecf357',
  iv: '01234567'
};

/**
 * 3DES加密 ：字符串 key iv 返回base64
 */
const Encrypt = (word: string, keyStr: string, ivStr: string): string => {
  let key = CryptoJS.enc.Utf8.parse(config.key);
  let iv = CryptoJS.enc.Utf8.parse(config.iv);

  // 如果传入了keyStr和ivStr，则使用传入的keyStr和ivStr
  if (keyStr && keyStr != '') {
    key = CryptoJS.enc.Utf8.parse(keyStr);
  }
  if (ivStr && ivStr != '') {
    iv = CryptoJS.enc.Utf8.parse(ivStr);
  }

  let param = JSON.stringify(word);

  let srcs = CryptoJS.enc.Utf8.parse(param);

  let encrypted = CryptoJS.TripleDES.encrypt(srcs, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  // 计算 Base64 字符串的大小（MB）
  const dataSizeMB =
    (CryptoJS.enc.Base64.stringify(encrypted.ciphertext).length * 0.75) / (1024 * 1024);
  return CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
};

// 参数加密
const main = async (props: Props): Response => {
  try {
    let { params, key, iv } = props;

    let result: string = Encrypt(params, key, iv);
    return {
      result: result
    };
  } catch (error) {
    throw new Error('随身厅接口入参加密异常', { cause: error });
  }
};

export default main;
