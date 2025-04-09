export const FastGPTProUrl = process.env.PRO_URL ? `${process.env.PRO_URL}/api` : '';
// @ts-ignore
export const isFastGPTProService = () => !!global.systemConfig;
