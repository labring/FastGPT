import { accountContract } from './account';
import { initContract } from '@ts-rest/core';
const c = initContract();

export const userContract = c.router({
  account: accountContract
});
