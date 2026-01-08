import { NextAPI } from '@/service/middleware/entry';
import { handler } from './history/getHistories';

export default NextAPI(handler);
