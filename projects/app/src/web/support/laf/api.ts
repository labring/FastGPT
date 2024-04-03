import axios from 'axios';

export const pat2Token = async (env: string, pat: string) => {
  try {
    return await axios.post(`https://${env}/v1/auth/pat2token`, {
      pat: pat
    });
  } catch (err: any) {
    throw new Error(err);
  }
};

export const getLafProfile = async (env: string, token: string) => {
  if (!token) return null;
  return await axios.get(`https://${env}/v1/user/profile`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

export const getLafApplications = async (env: string, token: string) => {
  return await axios.get(`https://${env}/v1/applications`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};

export const getLafAppDetail = async (env: string, token: string, appid: string) => {
  return await axios.get(`https://${env}/v1/applications/${appid}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
};
