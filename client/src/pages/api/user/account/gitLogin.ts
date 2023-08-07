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
  email: string;
  avatar_url: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { code } = req.query as { code: string };

    const { data: gitAccessToken } = await axios.post<string>(
      `https://github.com/login/oauth/access_token?client_id=${global.feConfigs.gitLoginKey}&client_secret=${global.systemEnv.gitLoginSecret}&code=${code}`
    );
    const jsonGitAccessToken = parseQueryString(gitAccessToken) as GithubAccessTokenType;

    const access_token = jsonGitAccessToken?.access_token;
    if (!access_token) {
      throw new Error('access_token is null');
    }

    const {
      data: { email, avatar_url }
    } = await axios.get<GithubUserType>('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    try {
      jsonRes(res, {
        data: await loginByUsername({ username: email, res })
      });
    } catch (err: any) {
      if (err?.code === 500) {
        jsonRes(res, {
          data: await registerUser({ username: email, avatar: avatar_url, res })
        });
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
  console.log(user, username);

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
  res
}: {
  username: string;
  avatar?: string;
  res: NextApiResponse;
}) {
  const response = await User.create({
    username,
    avatar,
    password: nanoid()
  });

  // 根据 id 获取用户信息
  const user = await User.findById(response._id);

  if (!user) {
    throw new Error('获取用户信息异常');
  }

  const token = generateToken(user._id);
  setCookie(res, token);

  return {
    user,
    token
  };
}
