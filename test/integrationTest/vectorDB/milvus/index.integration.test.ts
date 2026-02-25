import { describe, vi } from 'vitest';
import { createVectorDBTestSuite } from '../testSuites';

// Unmock vector controllers for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/milvus');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { MilvusCtrl } from '@fastgpt/service/common/vectorDB/milvus';

const isEnabled = Boolean(process.env.MILVUS_ADDRESS);

describe.skipIf(!isEnabled)('Milvus Vector Integration', () => {
  const vectorCtrl = new MilvusCtrl();
  createVectorDBTestSuite(vectorCtrl);
});
