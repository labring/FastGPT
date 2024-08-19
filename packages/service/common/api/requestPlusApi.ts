import { POST } from './plusRequest';

export const postTextCensor = (data: { text: string }) =>
  POST<{ code?: number; message: string }>('/common/censor/check', data)
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
