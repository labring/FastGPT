/**
 * Shared test data for vector database integration tests
 * All vector databases use the same test data for consistency
 */

// Generate a fixed 1536-dimensional vector for testing
// Using deterministic values for reproducibility
export function generateTestVector(dim: number = 1536): number[] {
  return Array.from({ length: dim }, (_, i) => {
    // Use sine to create deterministic values between -1 and 1
    return Math.sin(i * 0.01) * 0.5 + 0.5;
  });
}

// Generate multiple test vectors
export function generateTestVectors(count: number, dim: number = 1536): number[][] {
  return Array.from({ length: count }, () => generateTestVector(dim));
}

// Test data constants
export const TEST_DATA = {
  teamId: 'test-team-integration-001',
  datasetId: 'test-dataset-integration-001',
  collectionId: 'test-collection-integration-001',
  collectionId2: 'test-collection-integration-002',

  // Generate 5 test vectors (1536 dimensions each)
  vectors: generateTestVectors(5, 1536),

  // Different vector for search tests
  searchVector: generateTestVector(1536),

  // Metadata
  metadata: {
    source: 'integration-test',
    timestamp: Date.now()
  }
};

// Environment variable names for each database
export const ENV_CONFIG = {
  pg: {
    url: 'PG_URL',
    tableName: 'modeldata'
  },
  oceanbase: {
    url: 'OCEANBASE_URL',
    tableName: 'modeldata'
  },
  milvus: {
    address: 'MILVUS_ADDRESS',
    token: 'MILVUS_TOKEN',
    collectionName: 'modeldata',
    dbName: 'fastgpt'
  }
};

// Helper to skip test if env not configured
export function skipIfEnvNotSet(envName: string): void {
  if (!process.env[envName]) {
    throw new Error(`Skipping test: ${envName} is not set`);
  }
}
