import type { NextApiRequest } from 'next';
export type AuthAppPropsType = {
  AppId: string;
  req: NextApiRequest;
  authToken?: boolean;
  authRoot?: boolean;
  authApiKey?: boolean;
  per?: 'r' | 'w' | 'owner';
};
