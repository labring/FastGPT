import { settingContract } from './setting';
import { initContract } from '@ts-rest/core';
const c = initContract();

export const chatContract = c.router({
  setting: settingContract
});
