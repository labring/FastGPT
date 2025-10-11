import { supportContract } from './support';
import { chatContract } from './chat';
import { c } from '../../init';

// 前端使用的完整合约（开源 + Pro）
// FastGPT 后端使用的合约
export const contract = c.router({
  chat: {
    ...chatContract
  },
  support: {
    ...supportContract
  }
});
