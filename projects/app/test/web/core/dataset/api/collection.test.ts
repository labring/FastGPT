import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const mocks = vi.hoisted(() => ({
  post: vi.fn()
}));

vi.mock('@/web/common/api/request', () => ({
  DELETE: vi.fn(),
  GET: vi.fn(),
  POST: mocks.post,
  PUT: vi.fn()
}));

import {
  canBatchDownloadDatasetCollections,
  createBatchDownloadDatasetCollectionsSubmitter
} from '@/web/core/dataset/api/collection';

describe('batch dataset collection download', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('only enables the batch download entry for general datasets', () => {
    expect(canBatchDownloadDatasetCollections(DatasetTypeEnum.dataset)).toBe(true);
    expect(canBatchDownloadDatasetCollections(DatasetTypeEnum.websiteDataset)).toBe(false);
    expect(canBatchDownloadDatasetCollections(DatasetTypeEnum.apiDataset)).toBe(false);
  });

  it('requests a ticket with JSON and navigates to the native download URL', async () => {
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    const startDownload = vi.fn();
    const onSubmittingChange = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    expect(
      submitter.submit({
        datasetId: 'dataset-1',
        collectionIds: ['collection-a', 'collection-b'],
        onSubmittingChange
      })
    ).toBe(true);

    expect(mocks.post).toHaveBeenCalledWith(
      '/core/dataset/collection/getDownloadTicket',
      {
        datasetId: 'dataset-1',
        collectionIds: ['collection-a', 'collection-b']
      },
      { timeout: 0 }
    );
    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);

    await vi.waitFor(() =>
      expect(startDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/core/dataset/collection/batchDownload?ticket=ticket-123'
        })
      )
    );
    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(onSubmittingChange).toHaveBeenLastCalledWith(false);
  });

  it('uses a hidden iframe for the native download without replacing the current page', async () => {
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    const iframe = {
      hidden: false,
      src: '',
      contentDocument: { body: { textContent: '' } },
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      remove: vi.fn()
    };
    const appendChild = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => iframe),
      body: { appendChild }
    });
    vi.stubGlobal('window', { location: { href: '/dataset/detail' } });
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({ datasetId: 'dataset-1', collectionIds: ['collection-a'] });

    await vi.waitFor(() => expect(appendChild).toHaveBeenCalledWith(iframe));
    expect(iframe.hidden).toBe(true);
    expect(iframe.src).toBe('/api/core/dataset/collection/batchDownload?ticket=ticket-123');
    expect(window.location.href).toBe('/dataset/detail');
  });

  it('reports a JSON error loaded by the download iframe after the submit cooldown', async () => {
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    const downloadError = {
      code: 500,
      statusText: DatasetErrEnum.archiveInvalidFile,
      message: 'File unavailable'
    };
    let onLoad = () => {};
    const iframe = {
      hidden: false,
      src: '',
      contentDocument: { body: { textContent: JSON.stringify(downloadError) } },
      setAttribute: vi.fn(),
      addEventListener: vi.fn((event: string, listener: () => void) => {
        if (event === 'load') onLoad = listener;
      }),
      removeEventListener: vi.fn(),
      remove: vi.fn()
    };
    const appendChild = vi.fn();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => iframe),
      body: { appendChild }
    });
    const onError = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onError
    });

    await vi.waitFor(() => expect(appendChild).toHaveBeenCalledWith(iframe));
    vi.advanceTimersByTime(600);
    onLoad();

    expect(onError).toHaveBeenCalledWith(downloadError);
    expect(iframe.remove).toHaveBeenCalledOnce();
  });

  it('retries the same ticket beyond a fixed attempt count while it remains valid', async () => {
    vi.setSystemTime(new Date('2026-09-22T09:59:00.000Z'));
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    const attemptErrors: Array<(error: unknown) => void> = [];
    const attemptCleanups = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    const startDownload = vi.fn(({ onError }: { onError: (error: unknown) => void }) => {
      const attemptIndex = attemptErrors.length;
      attemptErrors.push(onError);
      return attemptCleanups[attemptIndex];
    });
    const onError = vi.fn();
    const onSubmittingChange = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onError,
      onSubmittingChange
    });
    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledOnce());
    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);

    attemptErrors[0]({
      code: 501000,
      statusText: DatasetErrEnum.archiveUnavailable,
      message: 'Download capacity unavailable'
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(startDownload).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    expect(startDownload).toHaveBeenCalledTimes(2);
    expect(startDownload.mock.calls[1]?.[0].url).toBe(
      '/api/core/dataset/collection/batchDownload?ticket=ticket-123'
    );
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(attemptCleanups[0]).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);

    attemptErrors[1]({
      code: 501000,
      statusText: DatasetErrEnum.archiveUnavailable,
      message: 'Download capacity unavailable'
    });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(startDownload).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(startDownload).toHaveBeenCalledTimes(3);

    attemptErrors[2]({
      code: 501000,
      statusText: DatasetErrEnum.archiveUnavailable,
      message: 'Download capacity unavailable'
    });
    await vi.advanceTimersByTimeAsync(3_999);
    expect(startDownload).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(startDownload).toHaveBeenCalledTimes(4);
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();

    const terminalError = {
      code: 501001,
      statusText: DatasetErrEnum.archiveInvalidFile,
      message: 'File unavailable'
    };
    attemptErrors[3](terminalError);
    expect(onError).toHaveBeenCalledWith(terminalError);
    expect(attemptCleanups[3]).toHaveBeenCalledOnce();
    expect(onSubmittingChange).toHaveBeenLastCalledWith(false);
  });

  it('retries the same ticket when the member lease is temporarily busy', async () => {
    vi.setSystemTime(new Date('2026-09-22T09:59:00.000Z'));
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    const attemptErrors: Array<(error: unknown) => void> = [];
    const startDownload = vi.fn(({ onError }: { onError: (error: unknown) => void }) => {
      attemptErrors.push(onError);
    });
    const onError = vi.fn();
    const onSubmittingChange = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onError,
      onSubmittingChange
    });
    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledOnce());

    attemptErrors[0]({
      code: 501000,
      statusText: DatasetErrEnum.archiveMemberBusy,
      message: 'Another download is being prepared'
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(startDownload).toHaveBeenCalledTimes(2);
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);
  });

  it('restores the loading state when a retryable error arrives after handoff', async () => {
    vi.setSystemTime(new Date('2026-09-22T09:59:00.000Z'));
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    const attemptErrors: Array<(error: unknown) => void> = [];
    const startDownload = vi.fn(({ onError }: { onError: (error: unknown) => void }) => {
      attemptErrors.push(onError);
    });
    const onSubmittingChange = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onSubmittingChange
    });
    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onSubmittingChange).toHaveBeenLastCalledWith(false);

    attemptErrors[0]({
      code: 501000,
      statusText: DatasetErrEnum.archiveUnavailable,
      message: 'Download capacity unavailable'
    });

    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);
  });

  it('does not let a late error from an older download unlock a newer submission', async () => {
    mocks.post
      .mockResolvedValueOnce({
        ticket: 'ticket-older',
        expiresAt: '2026-09-22T10:00:00.000Z'
      })
      .mockReturnValueOnce(new Promise(() => undefined));
    const attemptErrors: Array<(error: unknown) => void> = [];
    const startDownload = vi.fn(({ onError }: { onError: (error: unknown) => void }) => {
      attemptErrors.push(onError);
    });
    const onSubmittingChange = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onSubmittingChange
    });
    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onSubmittingChange).toHaveBeenLastCalledWith(false);

    expect(
      submitter.submit({
        datasetId: 'dataset-1',
        collectionIds: ['collection-b'],
        onSubmittingChange
      })
    ).toBe(true);
    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);

    attemptErrors[0]({
      code: 501001,
      statusText: DatasetErrEnum.archiveInvalidFile,
      message: 'File unavailable'
    });

    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);
    expect(submitter.submit({ datasetId: 'dataset-1', collectionIds: ['collection-c'] })).toBe(
      false
    );
  });

  it('does not let an older download retry while a newer submission is active', async () => {
    vi.setSystemTime(new Date('2026-09-22T09:59:00.000Z'));
    mocks.post
      .mockResolvedValueOnce({
        ticket: 'ticket-older',
        expiresAt: '2026-09-22T10:00:00.000Z'
      })
      .mockReturnValueOnce(new Promise(() => undefined));
    const attemptErrors: Array<(error: unknown) => void> = [];
    const startDownload = vi.fn(({ onError }: { onError: (error: unknown) => void }) => {
      attemptErrors.push(onError);
    });
    const onSubmittingChange = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onSubmittingChange
    });
    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(3_000);

    expect(
      submitter.submit({
        datasetId: 'dataset-1',
        collectionIds: ['collection-b'],
        onSubmittingChange
      })
    ).toBe(true);

    attemptErrors[0]({
      code: 501000,
      statusText: DatasetErrEnum.archiveUnavailable,
      message: 'Download capacity unavailable'
    });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(startDownload).toHaveBeenCalledOnce();
    expect(onSubmittingChange).toHaveBeenLastCalledWith(true);
    expect(submitter.submit({ datasetId: 'dataset-1', collectionIds: ['collection-c'] })).toBe(
      false
    );
  });

  it('reports capacity errors when the ticket cannot remain valid for another retry', async () => {
    vi.setSystemTime(new Date('2026-09-22T09:59:58.000Z'));
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    const attemptErrors: Array<(error: unknown) => void> = [];
    const startDownload = vi.fn(({ onError }: { onError: (error: unknown) => void }) => {
      attemptErrors.push(onError);
    });
    const onError = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onError
    });
    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledOnce());

    const capacityError = {
      code: 501000,
      statusText: DatasetErrEnum.archiveUnavailable,
      message: 'Download capacity unavailable'
    };
    attemptErrors[0](capacityError);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(startDownload).toHaveBeenCalledTimes(2);

    attemptErrors[1](capacityError);

    expect(onError).toHaveBeenCalledWith(capacityError);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(startDownload).toHaveBeenCalledTimes(2);
  });

  it('eventually removes the hidden iframe for a successful native download', async () => {
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    const iframe = {
      hidden: false,
      src: '',
      contentDocument: { body: { textContent: '' } },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      remove: vi.fn()
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => iframe),
      body: { appendChild: vi.fn() }
    });
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({ datasetId: 'dataset-1', collectionIds: ['collection-a'] });
    await vi.waitFor(() => expect(iframe.src).toContain('ticket=ticket-123'));

    expect(iframe.remove).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000);
    expect(iframe.remove).toHaveBeenCalledOnce();
  });

  it('reports a generic error when the download iframe loads a non-JSON gateway response', async () => {
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    let onLoad = () => {};
    const iframe = {
      hidden: false,
      src: '',
      contentDocument: { body: { textContent: '<html>Bad Gateway</html>' } },
      addEventListener: vi.fn((event: string, listener: () => void) => {
        if (event === 'load') onLoad = listener;
      }),
      removeEventListener: vi.fn(),
      remove: vi.fn()
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => iframe),
      body: { appendChild: vi.fn() }
    });
    const onError = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onError
    });

    await vi.waitFor(() => expect(iframe.src).toContain('ticket=ticket-123'));
    onLoad();

    expect(onError).toHaveBeenCalledWith(undefined);
    expect(iframe.remove).toHaveBeenCalledOnce();
  });

  it('reports a generic error when the download iframe fails to load', async () => {
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    let onIframeError = () => {};
    const iframe = {
      hidden: false,
      src: '',
      contentDocument: { body: { textContent: '' } },
      addEventListener: vi.fn((event: string, listener: () => void) => {
        if (event === 'error') onIframeError = listener;
      }),
      removeEventListener: vi.fn(),
      remove: vi.fn()
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => iframe),
      body: { appendChild: vi.fn() }
    });
    const onError = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onError
    });

    await vi.waitFor(() => expect(iframe.src).toContain('ticket=ticket-123'));
    onIframeError();

    expect(onError).toHaveBeenCalledWith(undefined);
    expect(iframe.remove).toHaveBeenCalledOnce();
  });

  it('reports ticket request errors without starting a download', async () => {
    const error = { code: 429, message: 'Too many downloads' };
    mocks.post.mockRejectedValue(error);
    const startDownload = vi.fn();
    const onError = vi.fn();
    const onSubmittingChange = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onError,
      onSubmittingChange
    });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(startDownload).not.toHaveBeenCalled();
    expect(onSubmittingChange).toHaveBeenLastCalledWith(false);
  });

  it('rejects repeated clicks while a ticket request or browser handoff is active', async () => {
    let resolveRequest: (value: { ticket: string; expiresAt: string }) => void = () => undefined;
    mocks.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    const startDownload = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    expect(submitter.submit({ datasetId: 'dataset-1', collectionIds: ['collection-a'] })).toBe(
      true
    );
    expect(submitter.submit({ datasetId: 'dataset-1', collectionIds: ['collection-b'] })).toBe(
      false
    );

    resolveRequest({ ticket: 'ticket-123', expiresAt: '2026-09-22T10:00:00.000Z' });
    await Promise.resolve();
    await Promise.resolve();
    expect(startDownload).toHaveBeenCalledOnce();
    expect(submitter.submit({ datasetId: 'dataset-1', collectionIds: ['collection-b'] })).toBe(
      false
    );

    vi.advanceTimersByTime(2_999);
    expect(submitter.submit({ datasetId: 'dataset-1', collectionIds: ['collection-b'] })).toBe(
      false
    );

    vi.advanceTimersByTime(1);
    expect(submitter.submit({ datasetId: 'dataset-1', collectionIds: ['collection-b'] })).toBe(
      true
    );
  });

  it('continues a pending download after owner cleanup without notifying the owner', async () => {
    let resolveRequest: (value: { ticket: string; expiresAt: string }) => void = () => undefined;
    mocks.post.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    const startDownload = vi.fn();
    const onError = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onError
    });
    submitter.cleanup();
    resolveRequest({ ticket: 'ticket-123', expiresAt: '2026-09-22T10:00:00.000Z' });
    await Promise.resolve();

    expect(startDownload).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps an active native download attached after owner cleanup', async () => {
    mocks.post.mockResolvedValue({
      ticket: 'ticket-123',
      expiresAt: '2026-09-22T10:00:00.000Z'
    });
    const cleanupDownload = vi.fn();
    const startDownload = vi.fn(() => cleanupDownload);
    const onError = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter({ startDownload });

    submitter.submit({
      datasetId: 'dataset-1',
      collectionIds: ['collection-a'],
      onError
    });
    await vi.waitFor(() => expect(startDownload).toHaveBeenCalledOnce());

    submitter.cleanup();

    expect(cleanupDownload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000);
    expect(cleanupDownload).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
