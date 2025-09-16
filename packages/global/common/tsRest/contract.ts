import { c } from './init';
import { appContract } from './contracts/app';
import { supportContract } from './contracts/support';

export const contract = c.router({
  app: appContract,
  support: supportContract
});
