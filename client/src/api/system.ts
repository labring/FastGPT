import { GET, POST, PUT } from './request';
import type { ChatModelItemType } from '@/constants/model';
import type { InitDateResponse } from '@/pages/api/system/getInitData';

export const getInitData = () => GET<InitDateResponse>('/system/getInitData');

export const getSystemModelList = () => GET<ChatModelItemType[]>('/system/getModels');

export const uploadImg = (base64Img: string) => POST<string>('/system/uploadImage', { base64Img });
