import { useSystemStoreContext } from '../context/useSystem';
import { useContextSelector } from 'use-context-selector';

export const useSystem = () => {
  const isPc = useContextSelector(useSystemStoreContext, (state) => state.isPc);

  return { isPc };
};
