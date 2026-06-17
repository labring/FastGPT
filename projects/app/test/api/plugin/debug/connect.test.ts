import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({
  exchangePluginDebugTicket: vi.fn(),
  withNextCors: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin/debugSession', () => ({
  exchangePluginDebugTicket: mocks.exchangePluginDebugTicket
}));

vi.mock('@fastgpt/service/common/middle/cors', () => ({
  withNextCors: mocks.withNextCors
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  LogCategories: {
    MODULE: {
      PLUGIN: {
        DEBUG: ['plugin', 'debug']
      }
    }
  },
  getLogger: () => ({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: vi.fn()
  })
}));

import handler from '@/pages/api/plugin/debug/connect';

function createResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn()
  } as unknown as NextApiResponse & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };

  return res;
}

describe('plugin debug connect handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withNextCors.mockResolvedValue(undefined);
    mocks.exchangePluginDebugTicket.mockResolvedValue({
      tcpUrl: 'tcp://tcp.example.com:39430',
      source: 'debug:tmbId:tmb_test:session:dbg_test',
      sessionId: 'gateway-session-id',
      session: {},
      connectToken: 'scoped-connection-token',
      expiresAt: 1781500000000
    });
  });

  it('exchanges ticket and returns connection info for CLI', async () => {
    const res = createResponse();

    await handler(
      {
        method: 'GET',
        query: {
          ticket: 'ticket_test'
        },
        headers: {}
      } as any,
      res
    );

    expect(mocks.withNextCors).toHaveBeenCalledTimes(1);
    expect(mocks.exchangePluginDebugTicket).toHaveBeenCalledWith({
      ticket: 'ticket_test'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      tcpUrl: 'tcp://tcp.example.com:39430',
      source: 'debug:tmbId:tmb_test:session:dbg_test',
      sessionId: 'gateway-session-id',
      session: {},
      connectToken: 'scoped-connection-token',
      expiresAt: 1781500000000
    });
    expect(mocks.loggerInfo).toHaveBeenCalledWith('[GET] /api/plugin/debug/connect');
    expect(mocks.loggerInfo).not.toHaveBeenCalledWith(expect.stringContaining('ticket_test'));
  });

  it('rejects missing ticket as request validation error', async () => {
    const res = createResponse();

    await handler(
      {
        method: 'GET',
        query: {},
        headers: {}
      } as any,
      res
    );

    expect(mocks.exchangePluginDebugTicket).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Data validation error'
    });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('[GET] /api/plugin/debug/connect - 400')
    );
  });
});
