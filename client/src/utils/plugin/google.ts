import axios from 'axios';
import { Obj2Query } from '../tools';

export const getClientToken = (googleVerKey: string) => {
  if (typeof grecaptcha === 'undefined' || !grecaptcha?.ready) return '';
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
  const res = await axios.post<{
    score?: number;
    success: boolean;
    'error-codes': string[];
  }>(`https://www.recaptcha.net/recaptcha/api/siteverify?${Obj2Query(data)}`);

  if (res.data.success) {
    return Promise.resolve('');
  }
  return Promise.reject(res?.data?.['error-codes']?.[0] || '非法环境');
};
