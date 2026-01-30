import { z } from 'zod';

// Supported vector database types
export const VectorDbTypeSchema = z.enum(['pg', 'oceanbase', 'milvus']);
export type VectorDbType = z.infer<typeof VectorDbTypeSchema>;

// Database connection configuration
export const DatabaseConfigSchema = z.object({
  type: VectorDbTypeSchema,
  address: z.string(),
  token: z.string().optional() // For Milvus authentication
});
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

// Vector record structure (unified format across all databases)
export const VectorRecordSchema = z.object({
  id: z.string(),
  vector: z.array(z.number()),
  teamId: z.string(),
  datasetId: z.string(),
  collectionId: z.string(),
  createTime: z.date()
});
export type VectorRecord = z.infer<typeof VectorRecordSchema>;

// Migration mode
export const MigrationModeSchema = z.enum(['offline', 'online']);
export type MigrationMode = z.infer<typeof MigrationModeSchema>;

// Migration status
export const MigrationStatusSchema = z.enum([
  'idle',
  'preparing',
  'full_sync',
  'incremental_sync',
  'switching',
  'completed',
  'failed',
  'cancelled'
]);
export type MigrationStatus = z.infer<typeof MigrationStatusSchema>;

// Migration error types
export const MigrationErrorTypeSchema = z.enum([
  'connection',
  'timeout',
  'data_corruption',
  'id_conflict',
  'validation_failed',
  'unknown'
]);
export type MigrationErrorType = z.infer<typeof MigrationErrorTypeSchema>;

// Migration error
export const MigrationErrorSchema = z.object({
  type: MigrationErrorTypeSchema,
  message: z.string(),
  recordId: z.string().optional(),
  timestamp: z.date(),
  retryable: z.boolean()
});
export type MigrationError = z.infer<typeof MigrationErrorSchema>;

// Migration configuration
export const MigrationConfigSchema = z.object({
  mode: MigrationModeSchema,
  sourceType: VectorDbTypeSchema,
  targetType: VectorDbTypeSchema,
  targetConfig: DatabaseConfigSchema,
  options: z
    .object({
      batchSize: z.number().default(1000),
      validateAfterMigration: z.boolean().default(true),
      preserveIds: z.boolean().default(true), // Try to preserve original IDs
      concurrency: z.number().default(3) // Number of concurrent batches
    })
    .optional()
});
export type MigrationConfig = z.infer<typeof MigrationConfigSchema>;

// Migration state (stored in MongoDB)
export const MigrationStateSchema = z.object({
  migrationId: z.string(),
  status: MigrationStatusSchema,
  mode: MigrationModeSchema,
  sourceType: VectorDbTypeSchema,
  targetType: VectorDbTypeSchema,
  lastSyncedTime: z.date().optional(),
  lastSyncedId: z.string().optional(),
  totalRecords: z.number(),
  syncedRecords: z.number(),
  failedRecords: z.number(),
  startTime: z.date(),
  endTime: z.date().optional(),
  errors: z.array(MigrationErrorSchema)
});
export type MigrationState = z.infer<typeof MigrationStateSchema>;

// Migration progress
export type MigrationProgress = {
  total: number;
  completed: number;
  failed: number;
  percentage: number;
  currentBatch: number;
  totalBatches: number;
};

// Migration result
export type MigrationResult = {
  success: boolean;
  migrationId: string;
  totalRecords: number;
  migratedRecords: number;
  failedRecords: number;
  idMappings: Map<string, string>; // Old ID -> New ID (only if IDs changed)
  errors: MigrationError[];
  duration: number; // Duration in milliseconds
  validation?: ValidationResult;
};

// Validation result
export type ValidationResult = {
  passed: boolean;
  countMatch: {
    source: number;
    target: number;
    match: boolean;
  };
  sampleMatch: {
    checked: number;
    matched: number;
    mismatchedIds: string[];
  };
};

// Exporter interface - for reading vectors from source database
export type VectorExporter = {
  // Get total count of vectors
  getCount(filter?: { teamId?: string; datasetId?: string }): Promise<number>;

  // Export vectors in batches using cursor-based pagination
  exportBatch(options: {
    afterId?: string;
    limit: number;
    teamId?: string;
    datasetId?: string;
  }): Promise<{
    records: VectorRecord[];
    hasMore: boolean;
    lastId?: string;
  }>;

  // Export vectors by time range (for incremental sync)
  exportByTimeRange(start: Date, end: Date): Promise<VectorRecord[]>;
};

// Importer interface - for writing vectors to target database
export type VectorImporter = {
  // Initialize target database (create tables/collections)
  init(): Promise<void>;

  // Import a batch of vectors
  importBatch(records: VectorRecord[]): Promise<{
    insertedIds: string[];
    idMappings: Map<string, string>; // Original ID -> New ID
    errors: MigrationError[];
  }>;

  // Delete vectors (for rollback)
  deleteBatch(ids: string[]): Promise<void>;

  // Get count in target
  getCount(): Promise<number>;
};

// ID mapping record (stored in MongoDB)
export type VectorIdMapping = {
  oldId: string;
  newId: string;
  teamId: string;
  datasetId: string;
  collectionId: string;
  migratedAt: Date;
  migrationId: string;
};

// Start migration request
export const StartMigrationRequestSchema = z.object({
  mode: MigrationModeSchema,
  sourceType: VectorDbTypeSchema,
  targetType: VectorDbTypeSchema,
  targetConfig: z.object({
    address: z.string(),
    token: z.string().optional()
  }),
  options: z
    .object({
      batchSize: z.number().optional(),
      validateAfterMigration: z.boolean().optional(),
      teamId: z.string().optional(), // Migrate specific team only
      datasetId: z.string().optional() // Migrate specific dataset only
    })
    .optional()
});
export type StartMigrationRequest = z.infer<typeof StartMigrationRequestSchema>;

// Migration status response
export type MigrationStatusResponse = {
  migrationId: string;
  status: MigrationStatus;
  progress: MigrationProgress;
  errors: MigrationError[];
  startTime: Date;
  estimatedTimeRemaining?: number;
};
