import { LockType } from './constants';

const splitString = '--';

export type LockIdType = {
  id: string;
  type?: LockType;
};

export function getLockTimerId({ id, type }: LockIdType): string {
  if (!type) {
    return id;
  }
  return `${type}${splitString}${id}`;
}

export function parseLockTimerId(lockId: string): LockIdType {
  const [type, id] = (() => {
    if (lockId.includes(splitString)) {
      return lockId.split(splitString) as [LockType, string]; // HACK: cast string to LockType
    }
    return [undefined, lockId];
  })();

  return {
    type,
    id
  };
}
