/**
 * SFT Bridge external service entry point
 *
 * Selects between mock implementation or real service based on environment variable:
 * - USE_SFT_BRIDGE_MOCK=true: Use mock implementation
 * - USE_SFT_BRIDGE_MOCK=false or not set: Use real SFT Bridge service (default)
 */

import { mockCreateSFTTask, mockQuerySFTTaskStatus, mockDeleteSFTTask } from './mock';
import {
  createSFTTask as realCreateSFTTask,
  querySFTTaskStatus as realQuerySFTTaskStatus,
  deleteSFTTask as realDeleteSFTTask
} from './client';

const useSFTBridgeMock = process.env.USE_SFT_BRIDGE_MOCK === 'true';

export const createSFTTask = useSFTBridgeMock ? mockCreateSFTTask : realCreateSFTTask;

export const querySFTTaskStatus = useSFTBridgeMock
  ? mockQuerySFTTaskStatus
  : realQuerySFTTaskStatus;

export const deleteSFTTask = useSFTBridgeMock ? mockDeleteSFTTask : realDeleteSFTTask;

export type {
  CreateSFTTaskRequest,
  CreateSFTTaskResponse,
  QuerySFTTaskStatusRequest,
  QuerySFTTaskStatusResponse,
  DeleteSFTTaskRequest,
  DeleteSFTTaskResponse
} from './types';

export { SFTTaskStatus } from './types';
