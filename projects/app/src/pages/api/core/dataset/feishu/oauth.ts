import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { getUserAccessToken } from './getUserAccessToken';

export type FeishuOauthQuery = {
  code: string;
  state: string;
};

export type FeishuOauthResponse = {
  error?: string;
};

export default async function handler(
  req: ApiRequestProps<FeishuOauthQuery>,
  res: ApiResponseType<FeishuOauthResponse>
) {
  try {
    const { code, state } = req.query;
    const stateData = JSON.parse(decodeURIComponent(state as string));
    const { returnUrl, datasetId } = stateData;

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }

    if (!datasetId) {
      return res.status(400).json({ error: 'Missing datasetId in returnUrl' });
    }

    // get user_access_token
    const user_access_token = await getUserAccessToken(code as string, datasetId);

    // redirect to original page
    const redirectUrl = new URL(returnUrl, 'http://localhost:3000');

    // add openConfigModal to redirectUrl
    redirectUrl.searchParams.append('openConfigModal', 'true');

    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Feishu OAuth Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
