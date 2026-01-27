import { addLog } from '../../../../common/system/log';
import { DEFAULT_SFT_BRIDGE_TIMEOUT, DEFAULT_DITING_TIMEOUT } from '../constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import axios from 'axios';

/**
 * Environment validation for rerank training task creation
 *
 * Validates that all required external services are accessible before creating a training task.
 * Throws error codes directly instead of returning validation results.
 */

/**
 * Check if SFT Bridge service is accessible
 * Attempts a simple connection test to the SFT Bridge service
 *
 * @throws {RerankTrainErrEnum.validationSftBridgeUnaccessible} If SFT Bridge is not accessible
 */
export async function validateSFTBridgeAccess(): Promise<void> {
  const sftBridgeUrl = process.env.SFT_BRIDGE_BASE_URL || 'http://sft-bridge:3000';
  const timeout = Number(process.env.SFT_BRIDGE_TIMEOUT) || DEFAULT_SFT_BRIDGE_TIMEOUT;

  // Skip validation in mock mode
  if (process.env.USE_SFT_BRIDGE_MOCK === 'true') {
    addLog.info('SFT Bridge validation skipped (mock mode enabled)');
    return;
  }

  try {
    // Try to access a health check endpoint or root endpoint with a short timeout
    const healthCheckUrl = `${sftBridgeUrl}/v1/health`;

    addLog.info('Validating SFT Bridge access', { url: healthCheckUrl, timeout });

    await axios.get(healthCheckUrl, {
      timeout: Math.min(timeout, 5000), // Use max 5 seconds for validation
      validateStatus: (status) => status < 500 // Accept any status below 500 (including 404)
    });

    addLog.info('SFT Bridge is accessible', { url: sftBridgeUrl });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error accessing SFT Bridge';

    addLog.error('SFT Bridge validation failed', {
      url: sftBridgeUrl,
      error: errorMessage
    });

    return Promise.reject(RerankTrainErrEnum.validationSftBridgeUnaccessible);
  }
}

/**
 * Check if DiTing service is accessible
 * Attempts a simple connection test to the DiTing service
 *
 * @throws {RerankTrainErrEnum.validationDitingUnaccessible} If DiTing is not accessible
 */
export async function validateDiTingAccess(): Promise<void> {
  const ditingUrl = process.env.DITING_BASE_URL || 'http://diting:3000';
  const timeout = Number(process.env.DITING_TIMEOUT) || DEFAULT_DITING_TIMEOUT;

  // Skip validation in mock mode
  if (process.env.USE_DITING_MOCK === 'true') {
    addLog.info('DiTing validation skipped (mock mode enabled)');
    return;
  }

  try {
    // Try to access a health check endpoint or root endpoint with a short timeout
    const healthCheckUrl = `${ditingUrl}/api/v1/healthz`;

    addLog.info('Validating DiTing access', { url: healthCheckUrl, timeout });

    await axios.get(healthCheckUrl, {
      timeout: Math.min(timeout, 5000), // Use max 5 seconds for validation
      validateStatus: (status) => status < 500 // Accept any status below 500 (including 404)
    });

    addLog.info('DiTing is accessible', { url: ditingUrl });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error accessing DiTing';

    addLog.error('DiTing validation failed', {
      url: ditingUrl,
      error: errorMessage
    });

    return Promise.reject(RerankTrainErrEnum.validationDitingUnaccessible);
  }
}

/**
 * Validate all external services required for training
 * Runs all validation checks in parallel
 *
 * @throws {RerankTrainErrEnum} If any validation fails
 */
export async function validateTrainingEnvironment(): Promise<void> {
  addLog.info('Starting training environment validation');

  // Run validations in parallel - will throw on first failure
  await Promise.all([validateSFTBridgeAccess(), validateDiTingAccess()]);

  addLog.info('Training environment validation successful');
}
