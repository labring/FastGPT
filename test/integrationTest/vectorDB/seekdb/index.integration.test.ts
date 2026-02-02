import { describe } from 'vitest';
import { SeekVectorCtrl } from '@fastgpt/service/common/vectorDB/seekdb';
import { createVectorDBTestSuite } from '../testSuites';

const isEnabled = Boolean(process.env.SEEKDB_URL);
const describePg = isEnabled ? describe : describe.skip;

describePg('Seekdb Vector Integration', () => {
  const vectorCtrl = new SeekVectorCtrl({ type: 'seekdb' });
  createVectorDBTestSuite(vectorCtrl);
});
