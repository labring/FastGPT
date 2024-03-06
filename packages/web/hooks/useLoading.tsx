import { useState, useCallback } from 'react';
import LoadingComponent from '../components/common/MyLoading';

export const useLoading = (props?: { defaultLoading: boolean }) => {
  const [isLoading, setIsLoading] = useState(props?.defaultLoading || false);

  const Loading = useCallback(
    ({
      loading,
      fixed = true,
      text = '',
      zIndex
    }: {
      loading?: boolean;
      fixed?: boolean;
      text?: string;
      zIndex?: number;
    }): JSX.Element | null => {
      return isLoading || loading ? (
        <LoadingComponent fixed={fixed} text={text} zIndex={zIndex} />
      ) : null;
    },
    [isLoading]
  );

  return {
    isLoading,
    setIsLoading,
    Loading
  };
};
