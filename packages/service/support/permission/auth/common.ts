import { parseHeaderCert } from '../controller';
import { AuthModeType } from '../type';
import { SERVICE_LOCAL_HOST } from '../../../common/system/tools';
import { ApiRequestProps } from '../../../type/next';

export const authCert = async (props: AuthModeType) => {
  const result = await parseHeaderCert(props);

  return {
    ...result,
    isOwner: true,
    canWrite: true
  };
};

/* auth the request from local service */
export const authRequestFromLocal = ({ req }: { req: ApiRequestProps }) => {
  if (req.headers.host !== SERVICE_LOCAL_HOST) {
    return Promise.reject('Invalid request');
  }
};
