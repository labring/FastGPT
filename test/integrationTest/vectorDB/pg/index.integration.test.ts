import { describe, vi } from 'vitest';
import { createVectorDBTestSuite } from '../testSuites';

// Unmock vector controllers for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/pg');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';

const isEnabled = Boolean(process.env.PG_URL);

describe.skipIf(!isEnabled)('PG Vector Integration', () => {
  const vectorCtrl = new PgVectorCtrl();
  createVectorDBTestSuite(vectorCtrl);
});
