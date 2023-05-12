import { GET, POST, PUT } from './request';

export const getFilling = () => GET<{ beianText: string }>('/system/getFiling');
