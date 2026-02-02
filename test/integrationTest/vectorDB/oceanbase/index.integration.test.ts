import { describe } from 'vitest';
import { ObVectorCtrl } from '@fastgpt/service/common/vectorDB/oceanbase';
import { createVectorDBTestSuite } from '../testSuites';

const isEnabled = Boolean(process.env.OCEANBASE_URL);
const describePg = isEnabled ? describe : describe.skip;

describePg('Oceanbase Vector Integration', () => {
  const vectorCtrl = new ObVectorCtrl({ type: 'oceanbase' });
  createVectorDBTestSuite(vectorCtrl);
});
