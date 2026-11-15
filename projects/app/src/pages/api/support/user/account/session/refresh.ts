import { NextAPI } from '@/service/middleware/entry';
import { refreshSessionHandler } from '@fastgpt/service/support/user/account/session/controller';

/** 共享会话生命周期边界；App / Pro 保持相同的认证与续约语义。 */
export default NextAPI(refreshSessionHandler);
