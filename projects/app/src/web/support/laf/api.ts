import { GET, POST } from '@/web/common/api/lafRequest';

export const postLafPat2Token = (pat: string) => POST<string>(`/v1/auth/pat2token`, { pat });

export const getLafApplications = (token: string) =>
  GET<
    {
      appid: string;
      name: string;
      state: 'Running' | 'Failed' | 'Stopped';
    }[]
  >(
    `/v1/applications`,
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

export const getLafAppDetail = (appid: string) =>
  GET<{
    appid: string;
    name: string;
    openapi_token: string;
    domain: {
      _id: string;
      appid: string;
      domain: string;
      state: string;
      phase: string;
    };
  }>(`/v1/applications/${appid}`);
