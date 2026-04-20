import { describe, vi } from 'vitest';
import { createVectorDBTestSuite } from '../testSuites';

// Unmock vector controllers for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/opengauss');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { OpenGaussVectorCtrl } from '@fastgpt/service/common/vectorDB/opengauss';

const isEnabled = Boolean(process.env.OPENGAUSS_URL);

describe.skipIf(!isEnabled)('OpenGauss Vector Integration', () => {
  const vectorCtrl = new OpenGaussVectorCtrl();
  createVectorDBTestSuite(vectorCtrl);
});
