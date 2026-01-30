/**
 * Vector Database Migration API
 *
 * POST /api/admin/migrateVector - Start a new migration
 * GET /api/admin/migrateVector - Get migration status
 *
 * This API allows administrators to migrate vector data between different
 * vector databases (PostgreSQL, OceanBase, Milvus).
 */

import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import {
  startMigration,
  getMigrationState,
  listMigrationStates,
  abortMigration,
  type StartMigrationRequest,
  type MigrationStatusResponse,
  type MigrationResult,
  StartMigrationRequestSchema
} from '@fastgpt/service/common/vectorDB/migration';
import { addLog } from '@fastgpt/service/common/system/log';

// Query types
export type MigrateVectorQuery = {
  action?: 'status' | 'list' | 'abort';
  migrationId?: string;
};

// Body types (for POST)
export type MigrateVectorBody = StartMigrationRequest;

// Response types
export type MigrateVectorResponse =
  | MigrationResult
  | MigrationStatusResponse
  | MigrationStatusResponse[]
  | { success: boolean; message: string };

async function handler(
  req: ApiRequestProps<MigrateVectorBody, MigrateVectorQuery>,
  res: ApiResponseType<MigrateVectorResponse>
): Promise<MigrateVectorResponse> {
  // Only root user can access this API
  await authCert({ req, authRoot: true });

  const { action, migrationId } = req.query;

  // GET request: query status
  if (req.method === 'GET') {
    if (action === 'list') {
      // List all migrations
      const states = listMigrationStates();
      return states.map((state) => ({
        migrationId: state.migrationId,
        status: state.status,
        progress: {
          total: state.totalRecords,
          completed: state.syncedRecords,
          failed: state.failedRecords,
          percentage:
            state.totalRecords > 0 ? Math.round((state.syncedRecords / state.totalRecords) * 100) : 0,
          currentBatch: 0,
          totalBatches: 0
        },
        errors: state.errors,
        startTime: state.startTime,
        estimatedTimeRemaining: undefined
      }));
    }

    if (action === 'abort' && migrationId) {
      // Abort a running migration
      const success = abortMigration(migrationId);
      return {
        success,
        message: success ? 'Migration aborted' : 'Migration not found or already completed'
      };
    }

    if (migrationId) {
      // Get specific migration status
      const state = getMigrationState(migrationId);
      if (!state) {
        return {
          success: false,
          message: 'Migration not found'
        };
      }

      return {
        migrationId: state.migrationId,
        status: state.status,
        progress: {
          total: state.totalRecords,
          completed: state.syncedRecords,
          failed: state.failedRecords,
          percentage:
            state.totalRecords > 0 ? Math.round((state.syncedRecords / state.totalRecords) * 100) : 0,
          currentBatch: 0,
          totalBatches: 0
        },
        errors: state.errors,
        startTime: state.startTime,
        estimatedTimeRemaining: undefined
      };
    }

    // Default: list all migrations
    const states = listMigrationStates();
    return states.map((state) => ({
      migrationId: state.migrationId,
      status: state.status,
      progress: {
        total: state.totalRecords,
        completed: state.syncedRecords,
        failed: state.failedRecords,
        percentage:
          state.totalRecords > 0 ? Math.round((state.syncedRecords / state.totalRecords) * 100) : 0,
        currentBatch: 0,
        totalBatches: 0
      },
      errors: state.errors,
      startTime: state.startTime,
      estimatedTimeRemaining: undefined
    }));
  }

  // POST request: start new migration
  if (req.method === 'POST') {
    const body = req.body;

    // Validate request body
    const parseResult = StartMigrationRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new Error(`Invalid request body: ${parseResult.error.message}`);
    }

    const config = parseResult.data;

    addLog.info(`[Migration API] Starting migration: ${config.sourceType} -> ${config.targetType}`);

    // Start migration in background
    const migrationPromise = startMigration(
      {
        mode: config.mode,
        sourceType: config.sourceType,
        targetType: config.targetType,
        targetConfig: {
          type: config.targetType,
          address: config.targetConfig.address,
          token: config.targetConfig.token
        },
        options: {
          batchSize: config.options?.batchSize || 1000,
          validateAfterMigration: config.options?.validateAfterMigration ?? true,
          preserveIds: true,
          concurrency: 3
        }
      },
      {
        teamId: config.options?.teamId,
        datasetId: config.options?.datasetId,
        onProgress: (progress) => {
          addLog.info(
            `[Migration] Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`
          );
        }
      }
    );

    // For offline migration, wait for completion
    // For online migration (future), return immediately
    if (config.mode === 'offline') {
      const result = await migrationPromise;
      return result;
    }

    // For online mode (future implementation)
    return {
      success: true,
      message: 'Migration started in background'
    };
  }

  throw new Error('Method not allowed');
}

export default NextAPI(handler);
