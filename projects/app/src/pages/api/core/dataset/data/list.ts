/** @deprecated Use /core/dataset/data/v2/list instead */
import { NextAPI } from '@/service/middleware/entry';
import handler from './v2/list';

export default NextAPI(handler);
