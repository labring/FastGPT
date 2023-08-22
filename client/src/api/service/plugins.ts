import { GET, POST } from './request';

export const textCensor = (data: { text: string }) => POST('/plugins/censor/text_baidu', data);
