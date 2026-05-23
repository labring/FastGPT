import { useState, useCallback } from 'react';
import LoadingComponent, { type LoadingVariant } from '../components/common/MyLoading';

export const useLoading = (props?: { defaultLoading: boolean }) => {
  const [isLoading, setIsLoading] = useState(props?.defaultLoading || false);

  const Loading = useCallback(
    ({
      loading,
      fixed = true,
      text = '',
      zIndex,
      variant
    }: {
      loading?: boolean;
      fixed?: boolean;
      text?: string;
      zIndex?: number;
      variant?: LoadingVariant;
    }): JSX.Element | null => {
      return isLoading || loading ? (
        <LoadingComponent fixed={fixed} text={text} zIndex={zIndex} variant={variant} />
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
