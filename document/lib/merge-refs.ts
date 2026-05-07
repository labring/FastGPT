import type * as React from 'react';

export function mergeRefs<T>(...refs: (React.LegacyRef<T> | undefined)[]): React.RefCallback<T> {
  return (value) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref && typeof ref !== 'string') {
        (ref as { current: T | null }).current = value;
      }
    });
  };
}
