import { describe, vi } from 'vitest';
import { createVectorDBTestSuite } from '../testSuites';

// Unmock vector controllers for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/oceanbase');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { ObVectorCtrl } from '@fastgpt/service/common/vectorDB/oceanbase';

const isEnabled = Boolean(process.env.OCEANBASE_URL);

describe.skipIf(!isEnabled)('Oceanbase Vector Integration', () => {
  const vectorCtrl = new ObVectorCtrl({ type: 'oceanbase' });
  createVectorDBTestSuite(vectorCtrl);
});
