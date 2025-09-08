import type { DispatchSubAppProps, DispatchSubAppResponse } from '../../type';

type FileReadParams = {
  fileIds: string[];
};

export const dispatchFileRead = async (
  props: DispatchSubAppProps<FileReadParams>
): Promise<DispatchSubAppResponse> => {
  return {
    response: ''
  };
};
