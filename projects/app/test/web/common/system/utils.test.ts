import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { downloadFetch, getIsMemberSyncMode, getRegisterMethods } from '@/web/common/system/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  FASTGPT_WEB_REQUEST_HEADER,
  FASTGPT_WEB_REQUEST_VALUE
} from '@fastgpt/global/common/system/constants';

const createFeConfigs = (overrides: Partial<FastGPTFeConfigsType>): FastGPTFeConfigsType => ({
  limit: { uploadFileMaxAmount: 10, uploadFileMaxSize: 100 },
  ...overrides
});

describe('downloadFetch', () => {
  const fetchMock = vi.fn();
  const anchor = { href: '', download: '', click: vi.fn() };
  const createElement = vi.fn(() => anchor);
  const appendChild = vi.fn();
  const removeChild = vi.fn();
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:download');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('document', { createElement, body: { appendChild, removeChild } });
    vi.stubGlobal('window', { URL: { createObjectURL, revokeObjectURL } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('extracts the 429 message for the existing toast translation flow without downloading', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 429,
          statusText: 'tooManyRequest',
          message: 'common:error.too_many_request',
          data: null
        }),
        { status: 429 }
      )
    );

    const error = await downloadFetch({
      url: '/api/core/app/logs/exportLogs',
      filename: 'logs.csv',
      body: { appId: 'app-id' }
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(Error);
    expect(getErrText(error)).toBe('common:error.too_many_request');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
  });

  it.each([
    ['Export failed', 'Export failed'],
    ['', 'Service Unavailable'],
    [JSON.stringify({ message: '' }), 'Service Unavailable'],
    ['null', 'Service Unavailable']
  ])('handles nonstandard error responses: %j', async (responseText, message) => {
    fetchMock.mockResolvedValueOnce(
      new Response(responseText, { status: 503, statusText: 'Service Unavailable' })
    );

    await expect(downloadFetch({ url: '/api/export', filename: 'logs.csv' })).rejects.toThrow(
      message
    );
    expect(createElement).not.toHaveBeenCalled();
  });

  it('downloads successful responses and releases the object URL', async () => {
    const response = new Response('title,content', { status: 200 });
    fetchMock.mockResolvedValueOnce(response);

    await downloadFetch({
      url: '/api/core/app/logs/exportLogs',
      filename: 'logs.csv',
      body: { appId: 'app-id' }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/core/app/logs/exportLogs'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [FASTGPT_WEB_REQUEST_HEADER]: FASTGPT_WEB_REQUEST_VALUE
        },
        body: JSON.stringify({ appId: 'app-id' })
      }
    );
    expect(await createObjectURL.mock.calls[0]?.[0].text()).toBe('title,content');
    expect(anchor).toMatchObject({ href: 'blob:download', download: 'logs.csv' });
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
  });
});

describe('system fe config utils', () => {
  it('filters legacy sync from register methods', () => {
    expect(getRegisterMethods(createFeConfigs({ register_method: ['sync'] }))).toEqual([]);
    expect(
      getRegisterMethods(createFeConfigs({ register_method: ['email', 'sync', 'phone'] }))
    ).toEqual(['email', 'phone']);
  });

  it('detects member sync mode from new teamMode and legacy register_method', () => {
    expect(getIsMemberSyncMode(createFeConfigs({ teamMode: 'sync', register_method: [] }))).toBe(
      true
    );
    expect(getIsMemberSyncMode(createFeConfigs({ register_method: ['sync'] }))).toBe(true);
    expect(
      getIsMemberSyncMode(createFeConfigs({ teamMode: 'single', register_method: ['sync'] }))
    ).toBe(false);
    expect(
      getIsMemberSyncMode(createFeConfigs({ teamMode: 'multi', register_method: ['sync'] }))
    ).toBe(false);
    expect(
      getIsMemberSyncMode(createFeConfigs({ teamMode: 'multi', register_method: ['phone'] }))
    ).toBe(false);
    expect(getIsMemberSyncMode(createFeConfigs({ teamMode: 'single', register_method: [] }))).toBe(
      false
    );
  });
});
