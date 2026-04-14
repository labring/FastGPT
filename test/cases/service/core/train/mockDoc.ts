/**
 * Creates a mock Mongoose Document with a `toObject()` method,
 * for use in unit tests that mock `Model.create()`.
 *
 * Usage:
 *   (MongoRerankTrainset.create as any).mockResolvedValue([
 *     createMockDoc({ _id: 'trainset_123', teamId: 'team_123' })
 *   ]);
 */
export function createMockDoc<T extends object>(data: T): T & { toObject: () => T } {
  return {
    ...data,
    toObject: () => ({ ...data })
  };
}
