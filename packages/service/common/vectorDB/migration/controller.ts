/**
 * Vector Database Migration Controller
 * Coordinates the migration process between different vector databases
 */

import type {
  MigrationConfig,
  MigrationResult,
  MigrationState,
  MigrationProgress,
  MigrationError,
  ValidationResult,
  VectorRecord,
  VectorDbType
} from './type';
import { createExporter } from './exporters';
import { createImporter } from './importers';
import { addLog } from '../../system/log';
import { customNanoid } from '@fastgpt/global/common/string/tools';

// Migration state storage (in-memory for now, can be extended to MongoDB)
const migrationStates = new Map<string, MigrationState>();

export class VectorMigrationController {
  private config: MigrationConfig;
  private migrationId: string;
  private state: MigrationState;
  private aborted: boolean = false;

  constructor(config: MigrationConfig) {
    this.config = config;
    this.migrationId = `migration_${Date.now()}_${customNanoid('abcdefghijklmnopqrstuvwxyz', 6)}`;
    this.state = {
      migrationId: this.migrationId,
      status: 'idle',
      mode: config.mode,
      sourceType: config.sourceType,
      targetType: config.targetType,
      totalRecords: 0,
      syncedRecords: 0,
      failedRecords: 0,
      startTime: new Date(),
      errors: []
    };
  }

  // Get current migration progress
  getProgress(): MigrationProgress {
    const batchSize = this.config.options?.batchSize || 1000;
    const totalBatches = Math.ceil(this.state.totalRecords / batchSize);
    const currentBatch = Math.ceil(this.state.syncedRecords / batchSize);

    return {
      total: this.state.totalRecords,
      completed: this.state.syncedRecords,
      failed: this.state.failedRecords,
      percentage:
        this.state.totalRecords > 0
          ? Math.round((this.state.syncedRecords / this.state.totalRecords) * 100)
          : 0,
      currentBatch,
      totalBatches
    };
  }

  // Get current state
  getState(): MigrationState {
    return { ...this.state };
  }

  // Abort migration
  abort(): void {
    this.aborted = true;
    this.state.status = 'cancelled';
    this.state.endTime = new Date();
    migrationStates.set(this.migrationId, this.state);
  }

  // Run offline (stop-the-world) migration
  async runOfflineMigration(options?: {
    teamId?: string;
    datasetId?: string;
    onProgress?: (progress: MigrationProgress) => void;
  }): Promise<MigrationResult> {
    const startTime = Date.now();
    const idMappings = new Map<string, string>();
    const allErrors: MigrationError[] = [];

    try {
      this.state.status = 'preparing';
      migrationStates.set(this.migrationId, this.state);

      addLog.info(`[Migration] Starting offline migration: ${this.config.sourceType} -> ${this.config.targetType}`);

      // Create exporter and importer
      const exporter = createExporter(this.config.sourceType);
      const importer = createImporter(this.config.targetType, {
        address: this.config.targetConfig.address,
        token: this.config.targetConfig.token
      });

      // Initialize target database
      addLog.info('[Migration] Initializing target database...');
      await importer.init();

      // Get total count
      const totalCount = await exporter.getCount({
        teamId: options?.teamId,
        datasetId: options?.datasetId
      });
      this.state.totalRecords = totalCount;

      addLog.info(`[Migration] Total records to migrate: ${totalCount}`);

      if (totalCount === 0) {
        this.state.status = 'completed';
        this.state.endTime = new Date();
        return {
          success: true,
          migrationId: this.migrationId,
          totalRecords: 0,
          migratedRecords: 0,
          failedRecords: 0,
          idMappings,
          errors: [],
          duration: Date.now() - startTime
        };
      }

      // Start full sync
      this.state.status = 'full_sync';
      migrationStates.set(this.migrationId, this.state);

      const batchSize = this.config.options?.batchSize || 1000;
      let lastId: string | undefined;
      let processedCount = 0;

      while (!this.aborted) {
        // Export batch from source
        const { records, hasMore, lastId: newLastId } = await exporter.exportBatch({
          afterId: lastId,
          limit: batchSize,
          teamId: options?.teamId,
          datasetId: options?.datasetId
        });

        if (records.length === 0) break;

        // Import batch to target
        const importResult = await importer.importBatch(records);

        // Collect ID mappings
        for (const [oldId, newId] of importResult.idMappings) {
          idMappings.set(oldId, newId);
        }

        // Collect errors
        allErrors.push(...importResult.errors);
        this.state.errors.push(...importResult.errors);

        // Update progress
        processedCount += records.length;
        this.state.syncedRecords = processedCount;
        this.state.failedRecords = allErrors.length;
        migrationStates.set(this.migrationId, this.state);

        // Notify progress
        if (options?.onProgress) {
          options.onProgress(this.getProgress());
        }

        addLog.info(
          `[Migration] Progress: ${processedCount}/${totalCount} (${Math.round((processedCount / totalCount) * 100)}%)`
        );

        lastId = newLastId;

        if (!hasMore) break;
      }

      // Validation (optional)
      let validation: ValidationResult | undefined;
      if (this.config.options?.validateAfterMigration !== false) {
        addLog.info('[Migration] Validating migration...');
        validation = await this.validate(exporter, importer);

        if (!validation.passed) {
          allErrors.push({
            type: 'validation_failed',
            message: `Validation failed: source=${validation.countMatch.source}, target=${validation.countMatch.target}`,
            timestamp: new Date(),
            retryable: false
          });
        }
      }

      // Complete
      this.state.status = this.aborted ? 'cancelled' : 'completed';
      this.state.endTime = new Date();
      migrationStates.set(this.migrationId, this.state);

      // Close connections
      if ('close' in importer && typeof importer.close === 'function') {
        await importer.close();
      }

      const duration = Date.now() - startTime;
      addLog.info(`[Migration] Completed in ${duration}ms. Migrated: ${processedCount}, Failed: ${allErrors.length}`);

      return {
        success: allErrors.length === 0 && !this.aborted,
        migrationId: this.migrationId,
        totalRecords: totalCount,
        migratedRecords: processedCount,
        failedRecords: allErrors.length,
        idMappings,
        errors: allErrors,
        duration,
        validation
      };
    } catch (error: any) {
      addLog.error('[Migration] Migration failed', error);
      this.state.status = 'failed';
      this.state.endTime = new Date();
      this.state.errors.push({
        type: 'unknown',
        message: error.message || 'Unknown error',
        timestamp: new Date(),
        retryable: false
      });
      migrationStates.set(this.migrationId, this.state);

      return {
        success: false,
        migrationId: this.migrationId,
        totalRecords: this.state.totalRecords,
        migratedRecords: this.state.syncedRecords,
        failedRecords: this.state.failedRecords + 1,
        idMappings,
        errors: [...allErrors, ...this.state.errors],
        duration: Date.now() - startTime
      };
    }
  }

  // Validate migration by comparing source and target
  private async validate(
    exporter: ReturnType<typeof createExporter>,
    importer: ReturnType<typeof createImporter>
  ): Promise<ValidationResult> {
    const sourceCount = await exporter.getCount();
    const targetCount = await importer.getCount();

    const countMatch = sourceCount === targetCount;

    // Sample check: export a few records and verify they exist in target
    // For simplicity, we just compare counts for now
    // A more thorough validation would involve vector comparison

    return {
      passed: countMatch,
      countMatch: {
        source: sourceCount,
        target: targetCount,
        match: countMatch
      },
      sampleMatch: {
        checked: 0,
        matched: 0,
        mismatchedIds: []
      }
    };
  }
}

// Get migration state by ID
export function getMigrationState(migrationId: string): MigrationState | undefined {
  return migrationStates.get(migrationId);
}

// List all migration states
export function listMigrationStates(): MigrationState[] {
  return Array.from(migrationStates.values());
}

// Start a new migration
export async function startMigration(
  config: MigrationConfig,
  options?: {
    teamId?: string;
    datasetId?: string;
    onProgress?: (progress: MigrationProgress) => void;
  }
): Promise<MigrationResult> {
  const controller = new VectorMigrationController(config);

  if (config.mode === 'offline') {
    return controller.runOfflineMigration(options);
  } else {
    // Online migration is more complex and requires background workers
    // For now, we'll throw an error
    throw new Error('Online migration is not yet implemented. Please use offline mode.');
  }
}

// Abort a running migration
export function abortMigration(migrationId: string): boolean {
  const state = migrationStates.get(migrationId);
  if (!state || state.status === 'completed' || state.status === 'failed') {
    return false;
  }

  state.status = 'cancelled';
  state.endTime = new Date();
  migrationStates.set(migrationId, state);
  return true;
}
