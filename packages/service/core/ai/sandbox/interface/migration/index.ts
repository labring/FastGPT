/** Legacy Sandbox 管理员迁移入口。 */
export { migrateLegacySandboxesToUserLevel } from '../../application/legacyMigration';
export type {
  LegacyDebugChatCleanupItem,
  LegacyDebugChatCleanupResult,
  LegacySandboxNormalizationResult,
  UserSandboxMigrationFailure,
  UserSandboxMigrationParams,
  UserSandboxMigrationResult
} from '../../application/legacyMigration';
