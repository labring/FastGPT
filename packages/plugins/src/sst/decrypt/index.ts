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
 * 3DES 解密 ：字符串 key iv  返回base64
 *
 */
const Decrypt = (word: string, keyStr: string, ivStr: string): string => {
  let key = CryptoJS.enc.Utf8.parse(config.key);
  let iv = CryptoJS.enc.Utf8.parse(config.iv);

  if (keyStr) {
    key = CryptoJS.enc.Utf8.parse(keyStr);
  }
  if (ivStr) {
    iv = CryptoJS.enc.Utf8.parse(ivStr);
  }

  let base64 = CryptoJS.enc.Base64.parse(word);
  let src = CryptoJS.enc.Base64.stringify(base64);

  var decrypt = CryptoJS.TripleDES.decrypt(src, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return decrypt.toString(CryptoJS.enc.Utf8);
};

// 参数解密
const main = async (props: Props): Response => {
  try {
    let { params, key, iv } = props;

    let result: string = Decrypt(params, key, iv);

    return {
      result: result
    };
  } catch (error) {
    throw new Error('随身厅接口出参解密异常', { cause: error });
  }
};

export default main;
