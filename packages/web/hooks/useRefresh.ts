import { useBoolean } from 'ahooks';

export const useRefresh = () => {
  const [_, { toggle }] = useBoolean();

  return {
    refresh: toggle
  };
};
