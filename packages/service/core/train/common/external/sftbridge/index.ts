/**
 * SFT Bridge external service entry point
 *
 * Selects between mock implementation or real service based on environment variable:
 * - SFT_BRIDGE_MOCK_ENABLE=true: Use mock implementation
 * - SFT_BRIDGE_MOCK_ENABLE=false or not set: Use real SFT Bridge service (default)
 */

import { mockCreateSFTTask, mockQuerySFTTaskStatus, mockDeleteSFTTask } from './mock';
import {
  createSFTTask as realCreateSFTTask,
  querySFTTaskStatus as realQuerySFTTaskStatus,
  deleteSFTTask as realDeleteSFTTask
} from './client';

import { trainEnv } from '../../env';

export const createSFTTask = trainEnv.SFT_BRIDGE_MOCK_ENABLE
  ? mockCreateSFTTask
  : realCreateSFTTask;

export const querySFTTaskStatus = trainEnv.SFT_BRIDGE_MOCK_ENABLE
  ? mockQuerySFTTaskStatus
  : realQuerySFTTaskStatus;

export const deleteSFTTask = trainEnv.SFT_BRIDGE_MOCK_ENABLE
  ? mockDeleteSFTTask
  : realDeleteSFTTask;

export type {
  CreateSFTTaskRequest,
  CreateSFTTaskResponse,
  QuerySFTTaskStatusRequest,
  QuerySFTTaskStatusResponse,
  DeleteSFTTaskRequest,
  DeleteSFTTaskResponse
} from './types';

export { SFTTaskStatus } from './types';
