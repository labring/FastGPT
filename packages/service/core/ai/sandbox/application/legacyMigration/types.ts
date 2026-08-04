import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import type { LegacySandboxInstanceSchemaType } from '../../infrastructure/instance/legacySchema';
import type { VolumeManagerResult } from '../../infrastructure/volume/service';
import type { SandboxRuntimePaths } from '../../utils';

export type UserSandboxMigrationParams = {
  dryRun?: boolean;
  skipError?: boolean;
};

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

export type LegacyDebugChatCleanupItem = {
  skillId: string;
  chatCount: number;
  chatItemCount: number;
  chatItemResponseCount: number;
  status: 'pending' | 'deleted';
};

export type LegacyDebugChatCleanupResult = {
  conflictAppSkillCount: number;
  matchedSkillCount: number;
  totalLegacyChats: number;
  totalChatItems: number;
  totalChatItemResponses: number;
  cleanedSkillCount: number;
  pendingChatCount: number;
  list: LegacyDebugChatCleanupItem[];
};

export type LegacySandboxNormalizationResult = {
  skillMatchedCount: number;
  skillModifiedCount: number;
  appMatchedCount: number;
  appModifiedCount: number;
  legacyFieldMatchedCount: number;
  legacyFieldModifiedCount: number;
  orphanMatchedCount: number;
  orphanDeletedCount: number;
  orphanFailedCount: number;
  sandboxPendingCount: number;
  legacyDebugChatCleanup: LegacyDebugChatCleanupResult;
  pendingCount: number;
  failures: UserSandboxMigrationFailure[];
};

export type UserSandboxMigrationResult = {
  dryRun: boolean;
  normalization: LegacySandboxNormalizationResult;
  normalizationBlocked: boolean;
  completedLegacyCount: number;
  legacySkillCount: number;
  migratedSkillCount: number;
  legacyAppCount: number;
  migratedAppCount: number;
  appGroupCount: number;
  completedAppGroupCount: number;
  failedCount: number;
  failures: UserSandboxMigrationFailure[];
  skippedCount: number;
  skipped: UserSandboxMigrationFailure[];
};
