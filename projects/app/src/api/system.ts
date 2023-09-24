import { GET, POST, PUT } from './request';
import type { InitDateResponse } from '@/pages/api/system/getInitData';

export const getInitData = () => GET<InitDateResponse>('/system/getInitData');
