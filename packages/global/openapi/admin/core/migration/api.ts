import { z } from 'zod';

const CountSchema = z.number().int().nonnegative();
const ConflictResultSchema = z.object({
  conflicts: CountSchema.meta({ description: 'Records skipped because of concurrent updates' })
});
const UnresolvedReferenceSchema = z.object({
  value: z.string().meta({ description: 'Legacy model name that could not be resolved' })
});

export const Initv4170ResponseSchema = z.object({
  message: z.string().meta({ description: 'Migration completion message' }),
  indexMigration: z.object({
    newIndexesCreated: z.array(z.string()).meta({ description: 'Indexes created by this run' })
  }),
  modelMigration: z.object({
    total: CountSchema.meta({ description: 'Model documents inspected' }),
    flattened: CountSchema.meta({ description: 'Legacy metadata documents flattened' }),
    normalized: CountSchema.meta({ description: 'Legacy model documents normalized' }),
    isSystemSet: CountSchema.meta({ description: 'Documents assigned an isSystem value' }),
    defaultsCleaned: CountSchema.meta({ description: 'Missing model defaults populated' })
  }),
  nameMap: z.object({
    modelCount: CountSchema.meta({ description: 'Provider model names mapped' }),
    nameCount: CountSchema.meta({ description: 'Model aliases mapped' }),
    ambiguous: z.array(
      z.object({
        name: z.string().meta({ description: 'Ambiguous model name' }),
        ids: z.array(z.string()).meta({ description: 'Matching model configuration IDs' })
      })
    )
  }),
  datasetMigration: ConflictResultSchema.extend({
    total: CountSchema.meta({ description: 'Dataset documents inspected' }),
    migrated: CountSchema.meta({ description: 'Dataset documents migrated' }),
    unresolved: z.array(
      UnresolvedReferenceSchema.extend({
        datasetId: z.string().meta({ description: 'Dataset ID' }),
        field: z.string().meta({ description: 'Legacy model field' })
      })
    )
  }),
  appWorkflowMigration: ConflictResultSchema.extend({
    appsChecked: CountSchema.meta({ description: 'Apps inspected' }),
    appsMigrated: CountSchema.meta({ description: 'Apps migrated' }),
    versionsMigrated: CountSchema.meta({ description: 'App versions migrated' }),
    unresolved: z.array(
      UnresolvedReferenceSchema.extend({
        appId: z.string().meta({ description: 'App ID' }),
        key: z.string().meta({ description: 'Legacy workflow input key' })
      })
    )
  }),
  evaluationMigration: ConflictResultSchema.extend({
    evalChecked: CountSchema.meta({ description: 'Evaluations inspected' }),
    evalMigrated: CountSchema.meta({ description: 'Evaluations migrated' }),
    unresolved: z.array(
      UnresolvedReferenceSchema.extend({
        evalId: z.string().meta({ description: 'Evaluation ID' })
      })
    )
  }),
  usageMigration: ConflictResultSchema.extend({
    itemsChecked: CountSchema.meta({ description: 'Usage items inspected' }),
    itemsMigrated: CountSchema.meta({ description: 'Usage items migrated' }),
    unresolved: CountSchema.meta({ description: 'Unresolved usage item references' })
  }),
  systemDefaultInit: z.object({
    configured: z.boolean().meta({ description: 'Whether system defaults were initialized' })
  }),
  permissionMigration: ConflictResultSchema.extend({
    total: CountSchema.meta({ description: 'Model permissions inspected' }),
    migrated: CountSchema.meta({ description: 'Model permissions migrated' }),
    unresolved: CountSchema.meta({ description: 'Unresolved permission references' })
  }),
  channelMigration: z.object({
    created: CountSchema.meta({ description: 'Channels created' }),
    skipped: CountSchema.meta({ description: 'Channel configurations skipped' }),
    failed: CountSchema.meta({ description: 'Channel configurations that failed' })
  })
});
export type Initv4170Response = z.infer<typeof Initv4170ResponseSchema>;
