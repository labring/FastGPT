import axios from 'axios';
import { Obj2Query } from '../tools';

export const getClientToken = (googleVerKey: string) => {
  if (!grecaptcha?.ready) return '';
  return new Promise<string>((resolve, reject) => {
    grecaptcha.ready(async () => {
      try {
        const token = await grecaptcha.execute(googleVerKey, {
          action: 'submit'
        });
        resolve(token);
      } catch (error) {
        reject(error);
      }
    });
  });
};

// service run
export const authGoogleToken = async (data: {
  secret: string;
  response: string;
  remoteip?: string;
}) => {
  const res = await axios.post<{ score?: number }>(
    `https://www.recaptcha.net/recaptcha/api/siteverify?${Obj2Query(data)}`
  );
  if (res.data.score && res.data.score >= 0.9) {
    return Promise.resolve('');
  }
  return Promise.reject('非法环境');
};
