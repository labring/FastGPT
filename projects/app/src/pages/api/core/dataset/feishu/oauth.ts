import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getUserAccessToken } from './getUserAccessToken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { code, state } = req.query;

    // await authCert({ req, authRoot: true });

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }
    const stateData = JSON.parse(decodeURIComponent(state as string));
    const { returnUrl, datasetId } = stateData;

    // get user_access_token
    const user_access_token = await getUserAccessToken(code as string, datasetId);

    // redirect to original page
    const redirectUrl = new URL(returnUrl, 'http://localhost:3000');

    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Feishu OAuth Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
