import { GET, POST, PUT } from './request';
import type { InitDateResponse } from '@/pages/api/system/getInitData';

export const getInitData = () => GET<InitDateResponse>('/system/getInitData');

export const uploadImg = (base64Img: string) => POST<string>('/system/uploadImage', { base64Img });
