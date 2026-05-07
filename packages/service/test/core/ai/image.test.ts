import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalizeImageToBase64 } from '@fastgpt/service/core/ai/image';
import { getImageBase64 } from '@fastgpt/service/common/file/image/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBase64: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: vi.fn()
}));

const mockGetImageBase64 = vi.mocked(getImageBase64);
const mockGetS3DatasetSource = vi.mocked(getS3DatasetSource);
const mockGetDatasetBase64Image = vi.fn();

describe('normalizeImageToBase64', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetS3DatasetSource.mockReturnValue({
      getDatasetBase64Image: mockGetDatasetBase64Image
    } as any);
    mockGetDatasetBase64Image.mockResolvedValue('data:image/png;base64,s3image');
    mockGetImageBase64.mockResolvedValue({
      completeBase64: 'data:image/jpeg;base64,remoteimage',
      base64: 'remoteimage'
    });
  });

  it('should preserve data image url', async () => {
    const dataUrl = 'data:image/png;base64,exists';

    await expect(normalizeImageToBase64(dataUrl)).resolves.toBe(dataUrl);
    expect(mockGetDatasetBase64Image).not.toHaveBeenCalled();
    expect(mockGetImageBase64).not.toHaveBeenCalled();
  });

  it.each([
    'dataset/dataset-id/image.png',
    'temp/team-id/image.png',
    'chat/app/user/chat/image.png'
  ])('should load private s3 key %s as base64', async (key) => {
    await expect(normalizeImageToBase64(key)).resolves.toBe('data:image/png;base64,s3image');

    expect(mockGetDatasetBase64Image).toHaveBeenCalledWith(key);
    expect(mockGetImageBase64).not.toHaveBeenCalled();
  });

  it('should load external image url as base64', async () => {
    await expect(normalizeImageToBase64('https://example.com/image.jpg')).resolves.toBe(
      'data:image/jpeg;base64,remoteimage'
    );

    expect(mockGetImageBase64).toHaveBeenCalledWith('https://example.com/image.jpg');
    expect(mockGetDatasetBase64Image).not.toHaveBeenCalled();
  });

  it('should reject when image loading fails', async () => {
    const error = new Error('download failed');
    mockGetImageBase64.mockRejectedValueOnce(error);

    await expect(normalizeImageToBase64('https://example.com/broken.jpg')).rejects.toBe(error);
  });
});
