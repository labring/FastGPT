export type TransactionContext = symbol;

export interface ITransactionRunner {
  withTransaction<T>(handler: (context: TransactionContext) => Promise<T>): Promise<T>;
}
