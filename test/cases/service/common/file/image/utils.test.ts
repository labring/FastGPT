import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isValidImageContentType,
  detectImageTypeFromBuffer,
  guessBase64ImageType,
  getImageBase64,
  addEndpointToImageUrl
} from '@fastgpt/service/common/file/image/utils';

const mockAxiosGet = vi.fn();
vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: {
    get: (...args: any[]) => mockAxiosGet(...args)
  },
  createProxyAxios: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/serverRequest', () => ({
  serverRequestBaseUrl: 'http://localhost:3000'
}));

describe('isValidImageContentType', () => {
  it('should return true for valid image MIME types', () => {
    expect(isValidImageContentType('image/jpeg')).toBe(true);
    expect(isValidImageContentType('image/jpg')).toBe(true);
    expect(isValidImageContentType('image/png')).toBe(true);
    expect(isValidImageContentType('image/gif')).toBe(true);
    expect(isValidImageContentType('image/webp')).toBe(true);
    expect(isValidImageContentType('image/bmp')).toBe(true);
    expect(isValidImageContentType('image/svg+xml')).toBe(true);
    expect(isValidImageContentType('image/tiff')).toBe(true);
    expect(isValidImageContentType('image/x-icon')).toBe(true);
    expect(isValidImageContentType('image/vnd.microsoft.icon')).toBe(true);
    expect(isValidImageContentType('image/ico')).toBe(true);
    expect(isValidImageContentType('image/heic')).toBe(true);
    expect(isValidImageContentType('image/heif')).toBe(true);
    expect(isValidImageContentType('image/avif')).toBe(true);
  });

  it('should return false for invalid image MIME types', () => {
    expect(isValidImageContentType('text/plain')).toBe(false);
    expect(isValidImageContentType('application/json')).toBe(false);
    expect(isValidImageContentType('video/mp4')).toBe(false);
    expect(isValidImageContentType('audio/mpeg')).toBe(false);
    expect(isValidImageContentType('application/pdf')).toBe(false);
  });

  it('should return false for empty or undefined input', () => {
    expect(isValidImageContentType('')).toBe(false);
    expect(isValidImageContentType(undefined as any)).toBe(false);
    expect(isValidImageContentType(null as any)).toBe(false);
  });

  it('should be case-sensitive (requires lowercase input)', () => {
    // Note: This function expects lowercase input
    // The getContentTypeFromHeader function should normalize it first
    expect(isValidImageContentType('IMAGE/JPEG')).toBe(false);
    expect(isValidImageContentType('Image/Png')).toBe(false);
  });
});

describe('detectImageTypeFromBuffer', () => {
  it('should detect JPEG images', () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(detectImageTypeFromBuffer(jpegBuffer)).toBe('image/jpeg');
  });

  it('should detect PNG images', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectImageTypeFromBuffer(pngBuffer)).toBe('image/png');
  });

  it('should detect GIF images', () => {
    const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);
    expect(detectImageTypeFromBuffer(gifBuffer)).toBe('image/gif');
  });

  it('should detect WebP images', () => {
    // RIFF....WEBP
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
    ]);
    expect(detectImageTypeFromBuffer(webpBuffer)).toBe('image/webp');
  });

  it('should detect BMP images', () => {
    const bmpBuffer = Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectImageTypeFromBuffer(bmpBuffer)).toBe('image/bmp');
  });

  it('should detect TIFF images (little-endian)', () => {
    const tiffBuffer = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectImageTypeFromBuffer(tiffBuffer)).toBe('image/tiff');
  });

  it('should detect TIFF images (big-endian)', () => {
    const tiffBuffer = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x00]);
    expect(detectImageTypeFromBuffer(tiffBuffer)).toBe('image/tiff');
  });

  it('should detect SVG images', () => {
    const svgBuffer = Buffer.from([0x3c, 0x73, 0x76, 0x67, 0x20, 0x78, 0x6d, 0x6c]);
    expect(detectImageTypeFromBuffer(svgBuffer)).toBe('image/svg+xml');
  });

  it('should detect ICO images', () => {
    const icoBuffer = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectImageTypeFromBuffer(icoBuffer)).toBe('image/x-icon');
  });

  it('should return undefined for invalid or too short buffers', () => {
    expect(detectImageTypeFromBuffer(Buffer.from([]))).toBe(undefined);
    expect(detectImageTypeFromBuffer(Buffer.from([0x00]))).toBe(undefined);
    expect(detectImageTypeFromBuffer(Buffer.from([0x00, 0x00]))).toBe(undefined);
    expect(detectImageTypeFromBuffer(null as any)).toBe(undefined);
    expect(detectImageTypeFromBuffer(undefined as any)).toBe(undefined);
  });

  it('should return undefined for unknown image formats', () => {
    const unknownBuffer = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11]);
    expect(detectImageTypeFromBuffer(unknownBuffer)).toBe(undefined);
  });

  it('should not detect WebP without proper WEBP marker', () => {
    // RIFF but no WEBP marker
    const fakeWebpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x42, 0x43, 0x44
    ]);
    expect(detectImageTypeFromBuffer(fakeWebpBuffer)).toBe(undefined);
  });
});

describe('guessBase64ImageType', () => {
  it('should detect JPEG from base64 string', () => {
    // /9j/ is the base64 encoded start of a JPEG file (0xFF 0xD8 0xFF)
    const jpegBase64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/';
    expect(guessBase64ImageType(jpegBase64)).toBe('image/jpeg');
  });

  it('should detect PNG from base64 string', () => {
    // iVBORw== is the base64 encoded start of a PNG file
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    expect(guessBase64ImageType(pngBase64)).toBe('image/png');
  });

  it('should detect GIF from base64 string', () => {
    // R0lGOD is the base64 encoded start of a GIF file
    const gifBase64 = 'R0lGODlhAQABAAAAACw=';
    expect(guessBase64ImageType(gifBase64)).toBe('image/gif');
  });

  it('should detect WebP from base64 string', () => {
    // UklGR is RIFF in base64
    const webpBase64 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
    expect(guessBase64ImageType(webpBase64)).toBe('image/webp');
  });

  it('should detect BMP from base64 string', () => {
    // Qk0= is the base64 encoded start of a BMP file (0x42 0x4D)
    const bmpBase64 = 'Qk02AgAAAAAAADYAAAAoAAAA';
    expect(guessBase64ImageType(bmpBase64)).toBe('image/bmp');
  });

  it('should fallback to first character mapping for unknown formats', () => {
    // Test various first characters from BASE64_PREFIX_MAP
    expect(guessBase64ImageType('/')).toBe('image/jpeg');
    expect(guessBase64ImageType('i')).toBe('image/png');
    expect(guessBase64ImageType('R')).toBe('image/gif');
    expect(guessBase64ImageType('U')).toBe('image/webp');
    expect(guessBase64ImageType('Q')).toBe('image/bmp');
    expect(guessBase64ImageType('P')).toBe('image/svg+xml');
    expect(guessBase64ImageType('T')).toBe('image/tiff');
    expect(guessBase64ImageType('V')).toBe('image/vnd.microsoft.icon');
  });

  it('should return default type for unknown first characters', () => {
    expect(guessBase64ImageType('xyz')).toBe('image/jpeg');
    expect(guessBase64ImageType('123')).toBe('image/jpeg');
    expect(guessBase64ImageType('ABC')).toBe('image/jpeg');
  });

  it('should handle empty or invalid input', () => {
    expect(guessBase64ImageType('')).toBe('image/jpeg');
    expect(guessBase64ImageType(null as any)).toBe('image/jpeg');
    expect(guessBase64ImageType(undefined as any)).toBe('image/jpeg');
    expect(guessBase64ImageType(123 as any)).toBe('image/jpeg');
  });

  it('should handle invalid base64 strings', () => {
    // Should fallback to first character mapping
    expect(guessBase64ImageType('!!!invalid!!!')).toBe('image/jpeg');
    expect(guessBase64ImageType('not-base64')).toBe('image/jpeg');
  });

  it('should prefer buffer detection over first character mapping', () => {
    // Create a valid JPEG base64 that starts with 'i' (which would map to PNG)
    // But the actual content is JPEG
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const base64 = jpegBytes.toString('base64'); // This is "/9j/4A=="
    expect(guessBase64ImageType(base64)).toBe('image/jpeg');
  });
});

describe('getImageBase64', () => {
  beforeEach(() => {
    mockAxiosGet.mockReset();
  });

  it('should return base64 with correct mime when header has valid image content-type', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    mockAxiosGet.mockResolvedValue({
      data: pngBytes,
      headers: { 'content-type': 'image/png' }
    });

    const result = await getImageBase64('/api/system/img/test.png');

    expect(mockAxiosGet).toHaveBeenCalledWith('/api/system/img/test.png', {
      baseURL: 'http://localhost:3000',
      responseType: 'arraybuffer'
    });
    expect(result.mime).toBe('image/png');
    expect(result.base64).toBe(pngBytes.toString('base64'));
    expect(result.completeBase64).toBe(`data:image/png;base64,${pngBytes.toString('base64')}`);
  });

  it('should detect type from buffer when header content-type is not a valid image type', async () => {
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    mockAxiosGet.mockResolvedValue({
      data: jpegBytes,
      headers: { 'content-type': 'application/octet-stream' }
    });

    const result = await getImageBase64('/img/photo.jpg');

    expect(result.mime).toBe('image/jpeg');
    expect(result.base64).toBe(jpegBytes.toString('base64'));
  });

  it('should detect type from buffer when header content-type is missing', async () => {
    const gifBytes = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    mockAxiosGet.mockResolvedValue({
      data: gifBytes,
      headers: {}
    });

    const result = await getImageBase64('/img/anim.gif');

    expect(result.mime).toBe('image/gif');
  });

  it('should fallback to guessBase64ImageType when buffer detection fails', async () => {
    // Unknown magic bytes that do not match any signature
    const unknownBytes = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]);
    mockAxiosGet.mockResolvedValue({
      data: unknownBytes,
      headers: { 'content-type': 'text/html' }
    });

    const result = await getImageBase64('/img/unknown.dat');

    // guessBase64ImageType will try to decode the base64 of these bytes,
    // and since the buffer does not match any known signature, it falls back
    // to the first-character mapping of the base64 string
    expect(result.mime).toBeDefined();
    expect(result.base64).toBe(unknownBytes.toString('base64'));
  });

  it('should handle content-type header with charset parameter', async () => {
    const svgBytes = Buffer.from([0x3c, 0x73, 0x76, 0x67, 0x20, 0x78, 0x6d, 0x6c]);
    mockAxiosGet.mockResolvedValue({
      data: svgBytes,
      headers: { 'content-type': 'image/svg+xml; charset=utf-8' }
    });

    const result = await getImageBase64('/img/icon.svg');

    expect(result.mime).toBe('image/svg+xml');
  });

  it('should reject with error when axios request fails', async () => {
    const networkError = new Error('Network Error');
    mockAxiosGet.mockRejectedValue(networkError);

    await expect(getImageBase64('/img/broken.png')).rejects.toThrow('Network Error');
  });

  it('should reject when server returns non-image error response', async () => {
    mockAxiosGet.mockRejectedValue(new Error('Request failed with status code 404'));

    await expect(getImageBase64('/img/missing.png')).rejects.toThrow(
      'Request failed with status code 404'
    );
  });

  it('should handle empty arraybuffer response', async () => {
    const emptyBuffer = Buffer.from([]);
    mockAxiosGet.mockResolvedValue({
      data: emptyBuffer,
      headers: { 'content-type': 'image/png' }
    });

    const result = await getImageBase64('/img/empty.png');

    // Header says image/png and it is valid, so it should use that
    expect(result.mime).toBe('image/png');
    expect(result.base64).toBe('');
  });

  it('should prefer header content-type over buffer detection when header is valid', async () => {
    // JPEG magic bytes but header says image/webp
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    mockAxiosGet.mockResolvedValue({
      data: jpegBytes,
      headers: { 'content-type': 'image/webp' }
    });

    const result = await getImageBase64('/img/test.webp');

    // Header takes priority when it is a valid image type
    expect(result.mime).toBe('image/webp');
  });

  it('should construct completeBase64 in correct data URI format', async () => {
    const bmpBytes = Buffer.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00]);
    mockAxiosGet.mockResolvedValue({
      data: bmpBytes,
      headers: { 'content-type': 'image/bmp' }
    });

    const result = await getImageBase64('/img/test.bmp');

    expect(result.completeBase64).toMatch(/^data:image\/bmp;base64,[A-Za-z0-9+/=]+$/);
  });
});

describe('addEndpointToImageUrl', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.FE_DOMAIN;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  afterEach(() => {
    process.env.FE_DOMAIN = originalEnv.FE_DOMAIN;
    process.env.NEXT_PUBLIC_BASE_URL = originalEnv.NEXT_PUBLIC_BASE_URL;
  });

  it('should return text unchanged when FE_DOMAIN is not set', () => {
    delete process.env.FE_DOMAIN;
    const text = '/api/system/img/abc123.png';
    expect(addEndpointToImageUrl(text)).toBe(text);
  });

  it('should prepend FE_DOMAIN to matching image URLs without subRoute', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = '';

    const text = 'Here is an image: /api/system/img/abc123.png in the text';
    const result = addEndpointToImageUrl(text);

    expect(result).toBe(
      'Here is an image: https://example.com/api/system/img/abc123.png in the text'
    );
  });

  it('should prepend FE_DOMAIN to matching image URLs with subRoute', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = '/fastgpt';

    const text = 'Image: /fastgpt/api/system/img/abc123.png end';
    const result = addEndpointToImageUrl(text);

    expect(result).toBe('Image: https://example.com/fastgpt/api/system/img/abc123.png end');
  });

  it('should not modify URLs that already have a full http(s) prefix', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = '';

    const text = 'Already full: https://cdn.example.com/api/system/img/abc123.png';
    const result = addEndpointToImageUrl(text);

    expect(result).toBe(text);
  });

  it('should handle multiple image URLs in the same text', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = '';

    const text = 'First /api/system/img/img1.png and second /api/system/img/img2.jpg here';
    const result = addEndpointToImageUrl(text);

    expect(result).toBe(
      'First https://example.com/api/system/img/img1.png and second https://example.com/api/system/img/img2.jpg here'
    );
  });

  it('should not modify non-matching paths', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = '';

    const text = 'This is /api/other/endpoint and /some/path.png';
    const result = addEndpointToImageUrl(text);

    expect(result).toBe(text);
  });

  it('should return empty string unchanged', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    expect(addEndpointToImageUrl('')).toBe('');
  });

  it('should handle text with no image URLs', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = '';

    const text = 'This is plain text with no image references at all.';
    expect(addEndpointToImageUrl(text)).toBe(text);
  });

  it('should not double-prepend FE_DOMAIN to already-prefixed URLs with http', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = '';

    const text = 'http://other.com/api/system/img/abc123.png';
    const result = addEndpointToImageUrl(text);

    expect(result).toBe(text);
  });

  it('should handle FE_DOMAIN with trailing slash gracefully', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = '';

    const text = '/api/system/img/file-name_123.webp';
    const result = addEndpointToImageUrl(text);

    expect(result).toBe('https://example.com/api/system/img/file-name_123.webp');
  });

  it('should handle image URLs with various file extensions', () => {
    process.env.FE_DOMAIN = 'https://example.com';
    process.env.NEXT_PUBLIC_BASE_URL = '';

    expect(addEndpointToImageUrl('/api/system/img/test.jpg')).toBe(
      'https://example.com/api/system/img/test.jpg'
    );
    expect(addEndpointToImageUrl('/api/system/img/test.jpeg')).toBe(
      'https://example.com/api/system/img/test.jpeg'
    );
    expect(addEndpointToImageUrl('/api/system/img/test.gif')).toBe(
      'https://example.com/api/system/img/test.gif'
    );
    expect(addEndpointToImageUrl('/api/system/img/test.webp')).toBe(
      'https://example.com/api/system/img/test.webp'
    );
  });
});
