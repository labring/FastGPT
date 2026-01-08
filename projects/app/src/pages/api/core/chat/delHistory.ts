import { NextAPI } from '@/service/middleware/entry';
import { handler } from './history/delHistory';

export default NextAPI(handler);
