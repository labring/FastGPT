import { detect } from 'jschardet';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const DETECT_SAMPLE_SIZE = 1024;
const MAX_DETECT_SAMPLE_SIZE = DETECT_SAMPLE_SIZE * 3;

const hasUtf8Bom = (buffer: Buffer) =>
  buffer.length >= UTF8_BOM.length && UTF8_BOM.every((byte, index) => buffer[index] === byte);

const isContinuationByte = (byte: number) => byte >= 0x80 && byte <= 0xbf;

const isValidUtf8 = (buffer: Buffer) => {
  for (let i = 0; i < buffer.length; i++) {
    const byte1 = buffer[i];

    if (byte1 <= 0x7f) continue;

    if (byte1 >= 0xc2 && byte1 <= 0xdf) {
      if (i + 1 >= buffer.length || !isContinuationByte(buffer[i + 1])) return false;
      i += 1;
      continue;
    }

    if (byte1 === 0xe0) {
      if (
        i + 2 >= buffer.length ||
        buffer[i + 1] < 0xa0 ||
        buffer[i + 1] > 0xbf ||
        !isContinuationByte(buffer[i + 2])
      ) {
        return false;
      }
      i += 2;
      continue;
    }

    if (byte1 >= 0xe1 && byte1 <= 0xec) {
      if (
        i + 2 >= buffer.length ||
        !isContinuationByte(buffer[i + 1]) ||
        !isContinuationByte(buffer[i + 2])
      ) {
        return false;
      }
      i += 2;
      continue;
    }

    if (byte1 === 0xed) {
      if (
        i + 2 >= buffer.length ||
        buffer[i + 1] < 0x80 ||
        buffer[i + 1] > 0x9f ||
        !isContinuationByte(buffer[i + 2])
      ) {
        return false;
      }
      i += 2;
      continue;
    }

    if (byte1 >= 0xee && byte1 <= 0xef) {
      if (
        i + 2 >= buffer.length ||
        !isContinuationByte(buffer[i + 1]) ||
        !isContinuationByte(buffer[i + 2])
      ) {
        return false;
      }
      i += 2;
      continue;
    }

    if (byte1 === 0xf0) {
      if (
        i + 3 >= buffer.length ||
        buffer[i + 1] < 0x90 ||
        buffer[i + 1] > 0xbf ||
        !isContinuationByte(buffer[i + 2]) ||
        !isContinuationByte(buffer[i + 3])
      ) {
        return false;
      }
      i += 3;
      continue;
    }

    if (byte1 >= 0xf1 && byte1 <= 0xf3) {
      if (
        i + 3 >= buffer.length ||
        !isContinuationByte(buffer[i + 1]) ||
        !isContinuationByte(buffer[i + 2]) ||
        !isContinuationByte(buffer[i + 3])
      ) {
        return false;
      }
      i += 3;
      continue;
    }

    if (byte1 === 0xf4) {
      if (
        i + 3 >= buffer.length ||
        buffer[i + 1] < 0x80 ||
        buffer[i + 1] > 0x8f ||
        !isContinuationByte(buffer[i + 2]) ||
        !isContinuationByte(buffer[i + 3])
      ) {
        return false;
      }
      i += 3;
      continue;
    }

    return false;
  }

  return true;
};

export const hasNonAsciiByte = (buffer: Buffer) => {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] > 0x7f) return true;
  }
  return false;
};

const getDetectSample = (buffer: Buffer) => {
  if (buffer.length <= MAX_DETECT_SAMPLE_SIZE) return buffer;

  const head = buffer.subarray(0, DETECT_SAMPLE_SIZE);
  const middleStart = Math.floor((buffer.length - DETECT_SAMPLE_SIZE) / 2);
  const middle = buffer.subarray(middleStart, middleStart + DETECT_SAMPLE_SIZE);
  const tail = buffer.subarray(buffer.length - DETECT_SAMPLE_SIZE);

  return Buffer.concat([head, middle, tail]);
};

export const detectFileEncoding = (buffer: Buffer) => {
  if (hasUtf8Bom(buffer) || isValidUtf8(buffer)) {
    return 'utf-8';
  }

  const detectedEncoding = detect(getDetectSample(buffer))?.encoding?.toLocaleLowerCase();
  if (detectedEncoding === 'ascii' && hasNonAsciiByte(buffer)) {
    return 'utf-8';
  }

  return detectedEncoding;
};
