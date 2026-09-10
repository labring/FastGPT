import { describe, expect, it, vi } from 'vitest';
import { FASTGPT_WEB_REQUEST_HEADER } from '@fastgpt/global/common/system/constants';
import { isValidWebRequest, shouldValidateWebRequest, checkCsrf } from '@fastgpt/next/middle/csrf';

const request = (headers: Record<string, string>) => ({
  headers
});

describe('web request CSRF guard', () => {
  it('requires the Web header for GET login Cookie requests', () => {
    const req = request({ cookie: 'fastgpt_token=session-1' });

    expect(shouldValidateWebRequest(req)).toBe(true);
    expect(isValidWebRequest(req)).toBe(false);
    expect(
      isValidWebRequest(
        request({
          cookie: 'fastgpt_token=session-1',
          [FASTGPT_WEB_REQUEST_HEADER]: '1'
        })
      )
    ).toBe(true);
  });

  it('does not require the Web header for requests without a login Cookie', () => {
    expect(isValidWebRequest({ headers: { authorization: 'Bearer api-key' } })).toBe(true);
    expect(isValidWebRequest({ headers: { rootkey: 'root-key' } })).toBe(true);
    expect(isValidWebRequest(request({}))).toBe(true);
    expect(isValidWebRequest(request({ cookie: 'NEXT_LOCALE=en' }))).toBe(true);
  });

  it('rejects a GET Cookie request before the handler when the Web header is missing', async () => {
    const json = vi.fn();
    const res = {
      writableEnded: false,
      writableFinished: false,
      status: vi.fn(() => ({ json }))
    };

    await checkCsrf({
      req: {
        method: 'GET',
        url: '/api/core/app/update',
        headers: {
          cookie: 'fastgpt_token=session-1',
          host: 'fastgpt.example.com'
        }
      } as any,
      res: res as any
    });

    expect(res.status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusText: 'csrf_invalid', code: 403 })
    );
  });

  it('does not require the Web header without a login Cookie', () => {
    expect(isValidWebRequest(request({}))).toBe(true);
    expect(isValidWebRequest(request({ cookie: 'NEXT_LOCALE=en' }))).toBe(true);
  });

  it('supports standard Headers and rejects an empty Web header', () => {
    const headers = new Headers({
      cookie: 'fastgpt_token=session-1',
      [FASTGPT_WEB_REQUEST_HEADER]: '  '
    });

    expect(isValidWebRequest({ headers })).toBe(false);

    headers.set(FASTGPT_WEB_REQUEST_HEADER, '1');
    expect(isValidWebRequest({ headers })).toBe(true);
  });
});
