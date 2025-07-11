import { useBoolean } from 'ahooks';

export const useRefresh = () => {
  const [refreshSign, { toggle }] = useBoolean();

  return {
    refresh: toggle,
    refreshSign
  };
};
