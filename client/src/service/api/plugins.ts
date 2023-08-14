import { GET, POST } from './request';
import type { SendCodeBody, AuthCodeBody } from './plugins.d';

export const sendCode = (data: SendCodeBody) => POST(global.systemPlugins.authCode?.sendUrl, data);
export const authCode = (data: AuthCodeBody) => POST(global.systemPlugins.authCode?.authUrl, data);

export const textCensor = (data: { text: string }) => {
  if (!global.systemPlugins.censor?.textUrl) return;
  return POST(global.systemPlugins.censor?.textUrl, data);
};

export const getWxPayQRUrl = (amount: number) =>
  POST<{
    code_url: string;
    orderId: string;
  }>(global.systemPlugins.pay?.getWxQRUrl, { amount });
export const getWxPayQRResult = (orderId: string) =>
  POST<{
    trade_state: string;
    trade_state_desc: string;
  }>(global.systemPlugins.pay?.getWxQRResult, { orderId });
