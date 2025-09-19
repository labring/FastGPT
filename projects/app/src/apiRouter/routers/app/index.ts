import list from './list';
import type { Router } from '@fastgpt/global/common/tsRest/types';
import type { appContract } from '@fastgpt/global/common/tsRest/contracts/app';

const app: Router<typeof appContract> = {
  list
};

export default app;
