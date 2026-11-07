import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDingtalkAppAccessToken } from '@fastgpt/service/common/dingtalk/accessToken';
import { serviceEnv } from '@fastgpt/service/env';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@fastgpt/service/common/api/axios', () => ({ axiosWithoutSSRF: { post } }));

// 缓存并发、TTL 和 Redis 故障由 DAL 的 dingtalkAccessToken.test.ts 覆盖。
// 此处只 mock 远端鉴权 API；不同 appKey 避免前例缓存影响错误分支。
let caseId = 0;
const credentials = () => ({ appKey: `token-case-${caseId}`, appSecret: 'secret' });
const authError = '钉钉应用鉴权失败，请检查 AppKey/AppSecret 和应用权限';
beforeEach(() => {
  caseId++;
  post.mockReset();
});

describe('getDingtalkAppAccessToken', () => {
  it('使用当前部署基址和应用凭据读取 token', async () => {
    post.mockResolvedValueOnce({ data: { accessToken: 'token', expireIn: 7200 } });
    await expect(getDingtalkAppAccessToken(credentials())).resolves.toBe('token');
    expect(post).toHaveBeenCalledWith(
      `${serviceEnv.DINGTALK_BASE_URL}/v1.0/oauth2/accessToken`,
      credentials()
    );
  });

  it.each([
    { appKey: '', appSecret: 'secret' },
    { appKey: 'app', appSecret: '' },
    { appKey: 'app' }
  ])('凭据缺失 %j 时不发请求', async (server) => {
    await expect(getDingtalkAppAccessToken(server)).rejects.toBe(authError);
    expect(post).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { accessToken: '' }])('空 token 响应 %j 返回鉴权错误', async (data) => {
    post.mockResolvedValueOnce({ data });
    await expect(getDingtalkAppAccessToken(credentials())).rejects.toBe(authError);
  });

  it.each([
    { response: { status: 429 } },
    { response: { data: { code: '429' } } },
    { data: { errcode: 88 } },
    { data: { errorCode: 90018 } },
    { data: { errmsg: '限流' } },
    { message: 'too many requests' }
  ])('限流形态 %# 返回稳定提示', async (error) => {
    post.mockRejectedValueOnce(error);
    await expect(getDingtalkAppAccessToken(credentials())).rejects.toBe(
      '钉钉鉴权接口请求过快，请稍后重试'
    );
  });

  it.each([
    null,
    new Error('network failure'),
    { response: { status: 403, data: { message: 'denied' } } }
  ])('其他鉴权错误 %# 不泄露远端响应', async (error) => {
    post.mockRejectedValueOnce(error);
    await expect(getDingtalkAppAccessToken(credentials())).rejects.toBe(authError);
  });
});
