import { initContract } from '@ts-rest/core';
import { chatContract } from './chat';
const c = initContract();

export const coreContract = c.router({
  chat: chatContract
});
