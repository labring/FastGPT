// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { generateToken, setCookie } from '@/service/utils/tools';
import axios from 'axios';
import { parseQueryString } from '@/utils/tools';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 8);

type GithubAccessTokenType = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  token_type: 'bearer';
  scope: string;
};
type GithubUserType = {
  login: string;
  email: string;
  avatar_url: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { code, inviterId } = req.query as { code: string; inviterId?: string };

    const { data: gitAccessToken } = await axios.post<string>(
      `https://github.com/login/oauth/access_token?client_id=${global.feConfigs.gitLoginKey}&client_secret=${global.systemEnv.gitLoginSecret}&code=${code}`
    );
    const jsonGitAccessToken = parseQueryString(gitAccessToken) as GithubAccessTokenType;

    const access_token = jsonGitAccessToken?.access_token;
    if (!access_token) {
      throw new Error('access_token is null');
    }

    const { data } = await axios.get<GithubUserType>('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });
    const { login, avatar_url } = data;
    const username = `git-${login}`;

    try {
      jsonRes(res, {
        data: await loginByUsername({ username, res })
      });
    } catch (err: any) {
      if (err?.code === 500) {
        jsonRes(res, {
          data: await registerUser({ username, avatar: avatar_url, res, inviterId })
        });
        return;
      }
      throw new Error(err);
    }
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export async function loginByUsername({
  username,
  res
}: {
  username: string;
  res: NextApiResponse;
}) {
  const user = await User.findOne({ username });

  if (!user) {
    return Promise.reject({
      code: 500
    });
  }

  const token = generateToken(user._id);
  setCookie(res, token);
  return { user, token };
}

export async function registerUser({
  username,
  avatar,
  inviterId,
  res
}: {
  username: string;
  avatar?: string;
  inviterId?: string;
  res: NextApiResponse;
}) {
  const response = await User.create({
    username,
    avatar,
    password: nanoid(),
    inviterId
  });
  console.log(response, '-=-=-=');

  // 根据 id 获取用户信息
  const user = await User.findById(response._id);

  if (!user) {
    return Promise.reject('获取用户信息异常');
  }

  const token = generateToken(user._id);
  setCookie(res, token);

  return {
    user,
    token
  };
}
