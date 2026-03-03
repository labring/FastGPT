import { describe } from 'vitest';
import { MilvusCtrl } from '@fastgpt/service/common/vectorDB/milvus';
import { createVectorDBTestSuite } from '../testSuites';

const isEnabled = Boolean(process.env.MILVUS_ADDRESS);
const describePg = isEnabled ? describe : describe.skip;

describePg('Milvus Vector Integration', () => {
  const vectorCtrl = new MilvusCtrl();
  createVectorDBTestSuite(vectorCtrl);
});
