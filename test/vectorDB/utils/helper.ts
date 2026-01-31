/**
 * Helper utilities for vector database integration tests
 */
import { beforeEach, afterEach } from 'vitest';

/**
 * Test result interface
 */
export interface TestResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  duration?: number;
}

/**
 * Measure execution time of an async function
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ data: T; duration: number }> {
  const start = Date.now();
  const data = await fn();
  const duration = Date.now() - start;
  return { data, duration };
}

/**
 * Retry a function multiple times with delay
 */
export async function retry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Clean up test data
 */
export interface CleanupHandler {
  (): Promise<void>;
}

const cleanupHandlers: CleanupHandler[] = [];

export function registerCleanup(handler: CleanupHandler): void {
  cleanupHandlers.push(handler);
}

export async function runCleanup(): Promise<void> {
  for (const handler of cleanupHandlers) {
    try {
      await handler();
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  }
  cleanupHandlers.length = 0;
}

/**
 * Create a test context with setup/teardown
 */
export function createTestContext<T>(
  setup: () => Promise<T>,
  teardown: (data: T) => Promise<void>
) {
  let data: T;

  beforeEach(async () => {
    data = await setup();
  });

  afterEach(async () => {
    if (data) {
      await teardown(data);
    }
    await runCleanup();
  });

  return {
    getData: () => data,
  };
}

/**
 * Generate unique IDs for test isolation
 */
let testCounter = 0;

export function generateUniqueId(prefix: string = 'test'): string {
  testCounter++;
  return `${prefix}-${Date.now()}-${testCounter}`;
}

/**
 * Assert helper with detailed error messages
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`
    );
  }
}

export function assertGreaterThan(actual: number, min: number, message?: string): void {
  if (actual <= min) {
    throw new Error(
      `Assertion failed: ${message || `Expected ${actual} > ${min}`}`
    );
  }
}

export function assertArrayLength<T>(array: T[], length: number, message?: string): void {
  if (array.length !== length) {
    throw new Error(
      `Assertion failed: ${message || `Expected array length ${length}, got ${array.length}`}`
    );
  }
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format test name for output
 */
export function formatTestName(database: string, operation: string): string {
  return `[${database}] ${operation}`;
}
