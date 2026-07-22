import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import type { LegacySandboxInstanceSchemaType } from '../../infrastructure/instance/legacySchema';
import type { VolumeManagerResult } from '../../infrastructure/volume/service';
import type { SandboxRuntimePaths } from '../../utils';

export type UserSandboxMigrationParams = { dryRun?: boolean };

export type LegacyMigrationPhase =
  | 'pending'
  | 'archiveReady'
  | 'installed'
  | 'cleanupPending'
  | 'completed';

export type LegacySandboxCleanupStep =
  | 'archive_workspace'
  | 'mark_archive_deleting'
  | 'delete_sandbox'
  | 'delete_volume'
  | 'verify_archive'
  | 'complete_legacy_archive'
  | 'delete_archive'
  | 'delete_legacy_record';

export type ResolvedLegacySkill = {
  doc: LegacySandboxInstanceSchemaType;
  sourceId: string;
};

export type ResolvedLegacyApp = {
  doc: LegacySandboxInstanceSchemaType;
  sourceId: string;
  userId: string;
  chatId: string;
};

export type LegacyMigrationTarget = {
  provider: ISandbox;
  getRuntimePaths: () => SandboxRuntimePaths;
  storage?: VolumeManagerResult['storage'];
};

export type UserSandboxMigrationFailure = { sandboxId: string; error: string };

export type UserSandboxMigrationResult = {
  dryRun: boolean;
  completedLegacyCount: number;
  legacySkillCount: number;
  migratedSkillCount: number;
  legacyAppCount: number;
  migratedAppCount: number;
  appGroupCount: number;
  completedAppGroupCount: number;
  failedCount: number;
  failures: UserSandboxMigrationFailure[];
};
