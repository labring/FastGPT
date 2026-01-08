import { NextAPI } from '@/service/middleware/entry';
import { handler } from './history/updateHistory';

export default NextAPI(handler);
