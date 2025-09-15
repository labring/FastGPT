import { c } from './init';
import { appContract } from './contracts/app';
import { OpenAPIObject } from './server';

export const contract = c.router({
  app: appContract
});
