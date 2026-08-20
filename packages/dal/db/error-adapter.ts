import type { DatabaseOperationError } from './errors';

export type DatabaseErrorAdapter = {
  adapt(error: unknown): DatabaseOperationError;
  execute<T>(handler: () => Promise<T>): Promise<T>;
};
