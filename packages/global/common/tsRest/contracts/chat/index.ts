import { settingContract } from './setting';
import { c } from '../../init';

// 开源版接口（不带 /proApi 前缀）
export const chatCoreContract = c.router({
  // TODO
});

// Pro 版接口（带 /proApi 前缀）
export const chatProContract = c.router({
  setting: settingContract
});

// 完整合约（前端使用）= 开源 + Pro
export const chatContract = c.router({
  ...chatCoreContract,
  ...chatProContract
});
