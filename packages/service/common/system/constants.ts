export const FastGPTProUrl = process.env.PRO_URL ? `${process.env.PRO_URL}/api` : '';
export const isFastGPTMainService = !!process.env.PRO_URL;
// @ts-ignore
export const isFastGPTProService = () => !!global.systemConfig;
