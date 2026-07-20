import { describe, vi } from 'vitest';
import { createVectorDBTestSuite, createFullTextSearchTestSuite } from '../testSuites';

// Unmock vector controllers for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/milvus');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { MilvusCtrl } from '@fastgpt/service/common/vectorDB/milvus';

const isEnabled = Boolean(process.env.MILVUS_ADDRESS);

describe.skipIf(!isEnabled)('Milvus Vector Integration', () => {
  const vectorCtrl = new MilvusCtrl();
  createVectorDBTestSuite(vectorCtrl);
});

// Full-text search tests: skipped by default, opt-in via MILVUS_FULLTEXT_ENABLED
const fullTextEnabled = Boolean(process.env.MILVUS_FULLTEXT_ENABLED);

describe.skipIf(!fullTextEnabled)('Milvus Full-Text Search Integration', () => {
  const vectorCtrl = new MilvusCtrl();
  createFullTextSearchTestSuite(vectorCtrl);
});
