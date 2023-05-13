import { GET, POST, PUT } from './request';
import type { ChatModelItemType } from '@/constants/model';

export const getFilling = () => GET<{ beianText: string }>('/system/getFiling');

export const getSystemModelList = () => GET<ChatModelItemType[]>('/system/getModels');
