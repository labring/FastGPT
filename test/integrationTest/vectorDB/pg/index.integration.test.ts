import { describe } from 'vitest';
import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';
import { createVectorDBTestSuite } from '../testSuites';

const isEnabled = Boolean(process.env.PG_URL);
const describePg = isEnabled ? describe : describe.skip;

describePg('PG Vector Integration', () => {
  const vectorCtrl = new PgVectorCtrl();
  createVectorDBTestSuite(vectorCtrl);
});
