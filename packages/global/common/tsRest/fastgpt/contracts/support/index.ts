import { userContract } from './user';
import { initContract } from '@ts-rest/core';
const c = initContract();

export const supportContract = c.router({
  user: userContract
});
