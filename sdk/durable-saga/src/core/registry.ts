import type { AnyBoundSaga, BoundSaga } from './definition';
import { SagaDefinitionError } from './error';

export type SagaRegistry<TTransaction> = {
  register<Input, State>(definition: BoundSaga<Input, State, TTransaction>): void;
  seal(): void;
  get(name: string, version: number): AnyBoundSaga<TTransaction> | undefined;
  isSealed(): boolean;
};

/** Creates an explicit registry so applications control which historical definitions remain executable. */
export const createSagaRegistry = <TTransaction>(): SagaRegistry<TTransaction> => {
  const definitions = new Map<string, AnyBoundSaga<TTransaction>>();
  let sealed = false;

  return {
    register(definition) {
      if (sealed) {
        throw new SagaDefinitionError('Cannot register a Saga after the registry is sealed');
      }
      const key = `${definition.name}@${definition.version}`;
      const existing = definitions.get(key);
      if (existing) {
        const reason =
          existing.manifestSignature === definition.manifestSignature
            ? 'is already registered'
            : 'has a different manifest signature';
        throw new SagaDefinitionError(`Saga definition "${key}" ${reason}`);
      }
      // Registry lookup is runtime-keyed; generic Input/State types are restored by each definition's schemas.
      definitions.set(key, definition as unknown as AnyBoundSaga<TTransaction>);
    },
    seal() {
      sealed = true;
    },
    get(name, version) {
      return definitions.get(`${name}@${version}`);
    },
    isSealed() {
      return sealed;
    }
  };
};
