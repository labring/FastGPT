import { useSystemStoreContext } from '../context/useSystem';
import { useContextSelector } from 'use-context-selector';

export const useSystem = () => {
  const isPc = useContextSelector(useSystemStoreContext, (state) => state.isPc);
  const isMac =
    typeof window !== 'undefined' && window.navigator.userAgent.toLocaleLowerCase().includes('mac');

  return { isPc, isMac };
};
