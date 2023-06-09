import { useState, useCallback } from 'react';
import LoadingComponent from '@/components/Loading';

export const useLoading = (props?: { defaultLoading: boolean }) => {
  const [isLoading, setIsLoading] = useState(props?.defaultLoading || false);

  const Loading = useCallback(
    ({ loading, fixed = true }: { loading?: boolean; fixed?: boolean }): JSX.Element | null => {
      return isLoading || loading ? <LoadingComponent fixed={fixed} /> : null;
    },
    [isLoading]
  );

  return {
    isLoading,
    setIsLoading,
    Loading
  };
};
