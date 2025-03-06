import axios from 'axios';
import { addLog } from '../../system/log';
import { serverRequestBaseUrl } from '../../api/serverRequest';
import { getFileContentTypeFromHeader, guessBase64ImageType } from '../utils';
import { retryFn } from '@fastgpt/global/common/system/utils';

export const getImageBase64 = async (url: string) => {
  addLog.debug(`Load image to base64: ${url}`);

  try {
    const response = await retryFn(() =>
      axios.get(url, {
        baseURL: serverRequestBaseUrl,
        responseType: 'arraybuffer',
        proxy: false
      })
    );

    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    const imageType =
      getFileContentTypeFromHeader(response.headers['content-type']) ||
      guessBase64ImageType(base64);

    return {
      completeBase64: `data:${imageType};base64,${base64}`,
      base64,
      mime: imageType
    };
  } catch (error) {
    addLog.debug(`Load image to base64 failed: ${url}`);
    console.log(error);
    return Promise.reject(error);
  }
};
