import { describe, vi } from 'vitest';
import { createVectorDBTestSuite } from '../testSuites';

// Unmock vector controllers for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/oceanbase');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { SeekVectorCtrl } from '@fastgpt/service/common/vectorDB/seekdb';

const isEnabled = Boolean(process.env.SEEKDB_URL);

describe.skipIf(!isEnabled)('Seekdb Vector Integration', () => {
  const vectorCtrl = new SeekVectorCtrl({ type: 'seekdb' });
  createVectorDBTestSuite(vectorCtrl);
});
