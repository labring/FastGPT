import { isEqual } from 'lodash';
import { useRef } from 'react';
import type { DependencyList } from 'react';

/**
 * Enhanced memo hook that provides more stable references than useMemo
 * Similar to ahooks useCreation, ensures factory function is only called when dependencies change
 * @param factory - Function that returns the value to be memoized
 * @param deps - Dependency array to determine when to re-execute factory
 * @returns The memoized value
 */
export function useMemoEnhance<T>(factory: () => T, deps: DependencyList): T {
  const { current } = useRef({
    obj: undefined as undefined | T,
    initialized: false,
    deps: deps as DependencyList
  });

  // Check if this is the first render or if dependencies have changed
  if (!current.initialized || !isEqual(current.deps, deps)) {
    current.obj = factory();
    current.initialized = true;
    current.deps = deps;
  }

  return current.obj as T;
}
