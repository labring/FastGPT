import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosGetMock, axiosWithoutSSRFGetMock } = vi.hoisted(() => ({
  axiosGetMock: vi.fn(),
  axiosWithoutSSRFGetMock: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: { get: axiosGetMock },
  axiosWithoutSSRF: { get: axiosWithoutSSRFGetMock }
}));

vi.mock('@fastgpt/service/common/api/serverRequest', () => ({
  serverRequestBaseUrl: 'http://localhost:3000'
}));

const createStreamResponse = () => ({
  status: 200,
  headers: { 'content-length': '4', 'content-type': 'image/png' },
  data: Readable.from([Buffer.from([0x89, 0x50, 0x4e, 0x47])])
});

const { getImageBuffer, isTrustedOriginUrl } =
  await import('@fastgpt/service/common/file/image/utils');

describe('isTrustedOriginUrl', () => {
  it('matches only the configured origin', () => {
    expect(isTrustedOriginUrl('http://10.0.0.5:8080/preview/a.png', 'http://10.0.0.5:8080')).toBe(
      true
    );
    expect(isTrustedOriginUrl('http://10.0.0.5:9999/preview/a.png', 'http://10.0.0.5:8080')).toBe(
      false
    );
    expect(isTrustedOriginUrl('https://evil.example.com/a.png', 'http://10.0.0.5:8080')).toBe(
      false
    );
    expect(isTrustedOriginUrl('http://10.0.0.5:8080/preview/a.png')).toBe(false);
  });
});

describe('getImageBuffer trusted origin', () => {
  it('uses the SSRF-free client for the configured preview origin', async () => {
    axiosWithoutSSRFGetMock.mockResolvedValueOnce(createStreamResponse());

    const result = await getImageBuffer('http://10.0.0.5:8080/preview/a.png', {
      trustedOrigin: 'http://10.0.0.5:8080'
    });

    expect(result.mime).toBe('image/png');
    expect(axiosWithoutSSRFGetMock).toHaveBeenCalledTimes(1);
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('keeps the safe client for any other URL', async () => {
    axiosGetMock.mockResolvedValueOnce(createStreamResponse());

    await getImageBuffer('https://files.example.com/a.png', {
      trustedOrigin: 'http://10.0.0.5:8080'
    });

    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    expect(axiosWithoutSSRFGetMock).not.toHaveBeenCalled();
  });
});
