import { NextAPI } from '@/service/middleware/entry';
import { handler } from './record/getPaginationRecords';

export default NextAPI(handler);
