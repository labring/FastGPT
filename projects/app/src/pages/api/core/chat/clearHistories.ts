import { NextAPI } from '@/service/middleware/entry';
import { handler } from './history/clearHistories';

export default NextAPI(handler);
