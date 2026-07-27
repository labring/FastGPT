import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/system/img/[...id]';

const mocks = vi.hoisted(() => ({
  createPublicUrl: vi.fn(),
  isObjectIdValid: vi.fn(() => false)
}));

vi.mock('@fastgpt/service/common/s3/sources/avatar', () => ({
  getS3AvatarSource: vi.fn(() => ({
    createPublicUrl: mocks.createPublicUrl
  }))
}));

vi.mock('@fastgpt/service/common/file/image/controller', () => ({
  readMongoImg: vi.fn()
}));

vi.mock('@fastgpt/service/common/mongo', () => ({
  Types: {
    ObjectId: {
      isValid: mocks.isObjectIdValid
    }
  }
}));

describe('system image redirect', () => {
  const key = 'avatar/team-id/g0A71O-人事咨询小助手.png';
  const encodedPublicUrl =
    'https://cdn.example.com/avatar/team-id/g0A71O-%E4%BA%BA%E4%BA%8B%E5%92%A8%E8%AF%A2%E5%B0%8F%E5%8A%A9%E6%89%8B.png';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createPublicUrl.mockReturnValue(encodedPublicUrl);
  });

  it('does not double-encode an already encoded object URL', async () => {
    const req = {
      query: {
        id: key.split('/')
      }
    } as any;
    const res = {
      redirect: vi.fn()
    } as any;

    await handler(req, res);

    expect(mocks.createPublicUrl).toHaveBeenCalledWith(key);
    expect(res.redirect).toHaveBeenCalledWith(301, encodedPublicUrl);
  });
});
