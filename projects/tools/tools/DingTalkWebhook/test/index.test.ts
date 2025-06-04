import { expect, test, vi, type MockedFunction } from 'vitest';
import tool from '..';

test('dingtalk', async () => {
  const sign = 'mocked-sign';
  const timestamp = Date.now().toString();
  global.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      json: () =>
        Promise.resolve({
          errcode: 0,
          errmsg: 'success'
        })
    })
  ) as unknown as MockedFunction<typeof fetch>;
  // const { sign, timestamp } = createHmac('sha256', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  vi.mock(import('../src'), async (importOriginal) => {
    const original = await importOriginal();
    return {
      ...original,
      createHmac: vi.fn().mockImplementation(() => ({
        sign,
        timestamp
      }))
    };
  });

  await tool.cb({
    钉钉机器人地址:
      'https://oapi.dingtalk.com/robot/send?access_token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    加签值: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    发送的消息: 'Hello, world!'
  });

  expect(global.fetch).toHaveBeenCalled();
});
