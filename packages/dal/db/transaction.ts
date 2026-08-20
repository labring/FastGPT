export type TransactionContext = symbol;

export type TransactionRunner = {
  withTransaction<T>(handler: (context: TransactionContext) => Promise<T>): Promise<T>;
};
