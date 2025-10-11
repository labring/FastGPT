import { initContract } from '@ts-rest/core';
import { coreContract } from './core';
import { supportContract } from './support';

const c = initContract();

export const fastgptContract = c.router({
  core: coreContract,
  support: supportContract
});

export type FadtGPTContractType = typeof fastgptContract;
