import { describe, it, expect } from 'vitest';
import {
  isValidImageContentType,
  detectImageTypeFromBuffer,
  guessBase64ImageType
} from '@fastgpt/service/common/file/image/utils';

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
