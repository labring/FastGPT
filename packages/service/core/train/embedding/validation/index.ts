/**
 * Unified validation entry point for embedding training
 *
 * Exports all validation functions for easy import
 */

export {
  validateTrainingEnvironment,
  validateSFTBridgeAccess,
  validateDiTingAccess
} from './environment';
export { validateDatasetSynthesisIndexes } from './dataset';
