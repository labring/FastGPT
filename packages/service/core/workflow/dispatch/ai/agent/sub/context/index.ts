import type { DispatchSubAppProps, DispatchSubAppResponse } from '../../type';

export const dispatchContextAgent = async (
  props: DispatchSubAppProps<{}>
): Promise<DispatchSubAppResponse> => {
  return {
    response: ''
  };
};
