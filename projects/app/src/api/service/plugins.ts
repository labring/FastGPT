import { POST } from './request';

export const textCensor = (data: { text: string }) =>
  POST<{ code?: number; message: string }>('/plugins/censor/text_baidu', data)
    .then((res) => {
      if (res?.code === 5000) {
        return Promise.reject(res);
      }
    })
    .catch((err) => {
      if (err?.code === 5000) {
        return Promise.reject(err.message);
      }
      return Promise.resolve('');
    });
