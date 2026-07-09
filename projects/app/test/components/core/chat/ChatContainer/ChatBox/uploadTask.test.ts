import { describe, expect, it } from 'vitest';
import {
  canApplyUploadResult,
  createUploadId,
  findFileIndexByUploadId,
  getFileUploadId,
  isUploadAbortError
} from '@/components/core/chat/ChatContainer/ChatBox/utils/uploadTask';

const files = [
  { id: 'field-id-1', uploadId: 'upload-id-1' },
  { id: 'field-id-2' },
  { id: 'field-id-3', uploadId: 'upload-id-3' }
];

describe('createUploadId', () => {
  it('creates a stable-length upload id', () => {
    expect(createUploadId()).toHaveLength(12);
    expect(createUploadId()).not.toBe(createUploadId());
  });
});

describe('getFileUploadId', () => {
  it('prefers uploadId for new upload files', () => {
    expect(getFileUploadId(files[0])).toBe('upload-id-1');
  });

  it('falls back to id for legacy files', () => {
    expect(getFileUploadId(files[1])).toBe('field-id-2');
  });
});

describe('findFileIndexByUploadId', () => {
  it('finds files by uploadId', () => {
    expect(findFileIndexByUploadId(files, 'upload-id-3')).toBe(2);
  });

  it('finds legacy files by id fallback', () => {
    expect(findFileIndexByUploadId(files, 'field-id-2')).toBe(1);
  });

  it('returns -1 when the file no longer exists', () => {
    expect(findFileIndexByUploadId(files, 'missing-upload-id')).toBe(-1);
  });
});

describe('canApplyUploadResult', () => {
  it('allows writeback when the file still exists and task is active', () => {
    expect(
      canApplyUploadResult({
        files,
        uploadId: 'upload-id-1'
      })
    ).toBe(true);
  });

  it('blocks writeback after the file is removed', () => {
    expect(
      canApplyUploadResult({
        files,
        uploadId: 'missing-upload-id'
      })
    ).toBe(false);
  });

  it('blocks writeback after the task is canceled', () => {
    expect(
      canApplyUploadResult({
        files,
        uploadId: 'upload-id-1',
        canceled: true
      })
    ).toBe(false);
  });
});

describe('isUploadAbortError', () => {
  it('detects browser abort errors', () => {
    expect(isUploadAbortError({ name: 'AbortError' })).toBe(true);
  });

  it('detects axios cancellation errors', () => {
    expect(isUploadAbortError({ name: 'CanceledError' })).toBe(true);
    expect(isUploadAbortError({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isUploadAbortError({ __CANCEL__: true })).toBe(true);
  });

  it('does not treat ordinary errors as abort errors', () => {
    expect(isUploadAbortError(new Error('Upload failed'))).toBe(false);
    expect(isUploadAbortError('ERR_CANCELED')).toBe(false);
    expect(isUploadAbortError(undefined)).toBe(false);
  });
});
