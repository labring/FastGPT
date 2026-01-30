#!/usr/bin/env npx ts-node

/**
 * Vector Database Migration CLI Script
 *
 * Usage:
 *   # Offline migration from PostgreSQL to Milvus
 *   npx ts-node scripts/migrateVector.ts \
 *     --source pg --target milvus \
 *     --target-address "http://localhost:19530"
 *
 *   # Offline migration from Milvus to PostgreSQL
 *   npx ts-node scripts/migrateVector.ts \
 *     --source milvus --source-address "http://localhost:19530" \
 *     --target pg --target-address "postgresql://user:pass@localhost:5432/db"
 *
 *   # Migration with specific team/dataset
 *   npx ts-node scripts/migrateVector.ts \
 *     --source pg --target milvus \
 *     --target-address "http://localhost:19530" \
 *     --team-id "xxx" --dataset-id "yyy"
 *
 * Options:
 *   --source           Source database type: pg, oceanbase, milvus (default: pg)
 *   --source-address   Source database address (for milvus only, others use env)
 *   --source-token     Source database token (for milvus only)
 *   --target           Target database type: pg, oceanbase, milvus (required)
 *   --target-address   Target database address (required)
 *   --target-token     Target database token (for milvus only)
 *   --batch-size       Batch size for migration (default: 1000)
 *   --team-id          Migrate specific team only
 *   --dataset-id       Migrate specific dataset only
 *   --no-validate      Skip validation after migration
 *   --help             Show this help message
 */

// Simple argument parser
function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);

      if (key === 'help') {
        result.help = true;
        continue;
      }

      if (key === 'no-validate') {
        result.validate = false;
        continue;
      }

      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        result[key] = nextArg;
        i++;
      } else {
        result[key] = true;
      }
    }
  }

  return result;
}

function showHelp() {
  console.log(`
FastGPT Vector Database Migration Tool

Usage:
  npx ts-node scripts/migrateVector.ts [options]

Options:
  --source           Source database type: pg, oceanbase, milvus (default: pg)
  --source-address   Source database address (for milvus only, others use env)
  --source-token     Source database token (for milvus only)
  --target           Target database type: pg, oceanbase, milvus (required)
  --target-address   Target database address (required)
  --target-token     Target database token (for milvus only)
  --batch-size       Batch size for migration (default: 1000)
  --team-id          Migrate specific team only
  --dataset-id       Migrate specific dataset only
  --no-validate      Skip validation after migration
  --help             Show this help message

Examples:
  # Migrate from PostgreSQL to Milvus
  npx ts-node scripts/migrateVector.ts \\
    --source pg --target milvus \\
    --target-address "http://localhost:19530"

  # Migrate from Milvus to OceanBase
  npx ts-node scripts/migrateVector.ts \\
    --source milvus --source-address "http://localhost:19530" \\
    --target oceanbase --target-address "mysql://user:pass@localhost:2883/db"
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log('='.repeat(60));
  console.log('FastGPT Vector Database Migration Tool');
  console.log('='.repeat(60));

  // Validate required options
  if (!args.target) {
    console.error('Error: --target is required');
    showHelp();
    process.exit(1);
  }

  if (!args['target-address']) {
    console.error('Error: --target-address is required');
    showHelp();
    process.exit(1);
  }

  const sourceType = (args.source as string) || 'pg';
  const targetType = args.target as string;
  const targetAddress = args['target-address'] as string;
  const targetToken = args['target-token'] as string | undefined;
  const batchSize = parseInt((args['batch-size'] as string) || '1000', 10);
  const teamId = args['team-id'] as string | undefined;
  const datasetId = args['dataset-id'] as string | undefined;
  const validate = args.validate !== false;

  console.log(`\nMigration Configuration:`);
  console.log(`  Source: ${sourceType}`);
  console.log(`  Target: ${targetType}`);
  console.log(`  Target Address: ${targetAddress}`);
  console.log(`  Batch Size: ${batchSize}`);
  if (teamId) console.log(`  Team ID: ${teamId}`);
  if (datasetId) console.log(`  Dataset ID: ${datasetId}`);
  console.log(`  Validation: ${validate ? 'enabled' : 'disabled'}`);
  console.log('');

  // Dynamically import the migration module
  const { startMigration } = await import(
    '../packages/service/common/vectorDB/migration/controller'
  );

  try {
    console.log('Starting migration...\n');

    const result = await startMigration(
      {
        mode: 'offline' as const,
        sourceType: sourceType as 'pg' | 'oceanbase' | 'milvus',
        targetType: targetType as 'pg' | 'oceanbase' | 'milvus',
        targetConfig: {
          type: targetType as 'pg' | 'oceanbase' | 'milvus',
          address: targetAddress,
          token: targetToken
        },
        options: {
          batchSize,
          validateAfterMigration: validate,
          preserveIds: true,
          concurrency: 3
        }
      },
      {
        teamId,
        datasetId,
        onProgress: (progress) => {
          const bar = createProgressBar(progress.percentage);
          process.stdout.write(
            `\r${bar} ${progress.completed}/${progress.total} (${progress.percentage}%)`
          );
        }
      }
    );

    console.log('\n\n' + '='.repeat(60));
    console.log('Migration Complete!');
    console.log('='.repeat(60));
    console.log(`\nResults:`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Migration ID: ${result.migrationId}`);
    console.log(`  Total Records: ${result.totalRecords}`);
    console.log(`  Migrated Records: ${result.migratedRecords}`);
    console.log(`  Failed Records: ${result.failedRecords}`);
    console.log(`  Duration: ${formatDuration(result.duration)}`);

    if (result.validation) {
      console.log(`\nValidation:`);
      console.log(`  Passed: ${result.validation.passed}`);
      console.log(`  Source Count: ${result.validation.countMatch.source}`);
      console.log(`  Target Count: ${result.validation.countMatch.target}`);
    }

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      for (const error of result.errors.slice(0, 10)) {
        console.log(`  - [${error.type}] ${error.message}`);
      }
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

    if (result.idMappings.size > 0) {
      console.log(`\nID Mappings: ${result.idMappings.size} records`);
      console.log(`  (IDs were remapped during migration)`);
    }

    console.log('');
    process.exit(result.success ? 0 : 1);
  } catch (error: any) {
    console.error('\n\nMigration failed with error:', error.message);
    process.exit(1);
  }
}

function createProgressBar(percentage: number): string {
  const width = 30;
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
