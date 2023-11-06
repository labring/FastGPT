import { parseHeaderAuth } from '../controller';
import { AuthModeType } from '../type';

export const authCert = async (props: AuthModeType) => {
  const result = await parseHeaderAuth(props);

  return {
    ...result,
    isOwner: true,
    canWrite: true
  };
};
