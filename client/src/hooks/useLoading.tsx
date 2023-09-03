import { useState, useCallback } from 'react';
import LoadingComponent from '@/components/Loading';

export const useLoading = (props?: { defaultLoading: boolean }) => {
  const [isLoading, setIsLoading] = useState(props?.defaultLoading || false);

  const Loading = useCallback(
    ({
      loading,
      fixed = true,
      text = ''
    }: {
      loading?: boolean;
      fixed?: boolean;
      text?: string;
    }): JSX.Element | null => {
      return isLoading || loading ? <LoadingComponent fixed={fixed} text={text} /> : null;
    },
    [isLoading]
  );

  return {
    isLoading,
    setIsLoading,
    Loading
  };
};
