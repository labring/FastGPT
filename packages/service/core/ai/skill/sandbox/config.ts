/**
 * Skill Sandbox Configuration
 *
 * Provides configuration and defaults for sandbox management.
 */

import { serviceEnv } from '../../../../env';

export { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } from '../edit/config';

export type SkillSizeLimits = {
  maxUploadBytes: number; // Compressed upload size limit
  maxUncompressedBytes: number; // Uncompressed size after extraction (Zip Bomb guard)
  maxDownloadBytes: number; // Download from MinIO/S3
  maxSandboxPackageBytes: number; // Sandbox directory size before zip
};

const MB_TO_BYTES = 1024 * 1024;
const mbToBytes = (value: number) => value * MB_TO_BYTES;

/**
 * Get skill size limits from the single Skill package size environment variable.
 *
 * AGENT_SKILL_MAX_UPLOAD_SIZE follows the existing upload-file convention and is configured in MB.
 * Runtime checks compare File/Buffer byte lengths, so this function exposes byte values only. The
 * derived fields keep call sites explicit about which boundary they are enforcing.
 */
export function getSkillSizeLimits(): SkillSizeLimits {
  const maxPackageBytes = mbToBytes(serviceEnv.AGENT_SKILL_MAX_UPLOAD_SIZE);

  return {
    maxUploadBytes: maxPackageBytes,
    maxUncompressedBytes: maxPackageBytes,
    maxDownloadBytes: maxPackageBytes,
    maxSandboxPackageBytes: maxPackageBytes
  };
}
