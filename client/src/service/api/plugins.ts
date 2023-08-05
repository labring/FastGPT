import { POST } from './request';
import type { SendCodeBody, AuthCodeBody } from './plugins.d';

export const sendCode = (data: SendCodeBody) => POST(global.systemPlugins.authCode?.sendUrl, data);
export const authCode = (data: AuthCodeBody) => POST(global.systemPlugins.authCode?.authUrl, data);
