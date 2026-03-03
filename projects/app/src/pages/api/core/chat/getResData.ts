import { NextAPI } from '@/service/middleware/entry';
import { handler } from './record/getResData';

export default NextAPI(handler);
