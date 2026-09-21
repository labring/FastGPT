import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  canBatchDownloadDatasetCollections,
  createBatchDownloadDatasetCollectionsSubmitter
} from '@/web/core/dataset/api/collection';

describe('batch dataset collection download', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('', { url: 'https://fastgpt.example.com' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLFormElement', dom.window.HTMLFormElement);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    dom.window.close();
  });

  it('only enables the batch download entry for general datasets', () => {
    expect(canBatchDownloadDatasetCollections(DatasetTypeEnum.dataset)).toBe(true);
    expect(canBatchDownloadDatasetCollections(DatasetTypeEnum.websiteDataset)).toBe(false);
    expect(canBatchDownloadDatasetCollections(DatasetTypeEnum.apiDataset)).toBe(false);
  });

  it('submits every selected collection id through a native POST form', () => {
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => undefined);
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    expect(submitter.submit({ collectionIds: ['collection-a', 'collection-b'] })).toBe(true);

    const form = document.body.querySelector('form');
    const iframe = document.body.querySelector('iframe');

    expect(form).not.toBeNull();
    expect(iframe).not.toBeNull();
    expect(form?.method).toBe('post');
    expect(form?.action).toBe(
      `${window.location.origin}/api/core/dataset/collection/batchDownload`
    );
    expect(form?.target).toBe(iframe?.name);
    expect(
      Array.from(form?.querySelectorAll<HTMLInputElement>('input[name="collectionIds"]') ?? []).map(
        (input) => input.value
      )
    ).toEqual(['collection-a', 'collection-b']);
    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it('reports a same-origin JSON preflight error after an initial blank iframe load', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => undefined);
    const onPreflightError = vi.fn();
    const onSubmittingChange = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({ collectionIds: ['collection-a'], onPreflightError, onSubmittingChange });

    const iframe = document.body.querySelector('iframe');
    iframe?.dispatchEvent(new dom.window.Event('load'));
    iframe?.contentDocument?.body.replaceChildren();
    iframe?.contentDocument?.body.append('{"code":422,"message":"No downloadable files"}');
    iframe?.dispatchEvent(new dom.window.Event('load'));

    expect(onPreflightError).toHaveBeenCalledWith({
      code: 422,
      message: 'No downloadable files'
    });
    expect(iframe?.isConnected).toBe(false);
    vi.advanceTimersByTime(600);
    expect(onSubmittingChange).toHaveBeenLastCalledWith(false);
  });

  it('reports a generic error when the download iframe receives a non-JSON response', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => undefined);
    const onPreflightError = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({ collectionIds: ['collection-a'], onPreflightError });

    const iframe = document.body.querySelector('iframe');
    iframe?.dispatchEvent(new dom.window.Event('load'));
    iframe?.contentDocument?.body.replaceChildren();
    iframe?.contentDocument?.body.append('Gateway Timeout');
    iframe?.dispatchEvent(new dom.window.Event('load'));

    expect(onPreflightError).toHaveBeenCalledWith(undefined);
    expect(iframe?.isConnected).toBe(false);
    vi.advanceTimersByTime(600);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a generic error when the download iframe fails to load', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => undefined);
    const onPreflightError = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({ collectionIds: ['collection-a'], onPreflightError });

    const iframe = document.body.querySelector('iframe');
    iframe?.dispatchEvent(new dom.window.Event('error'));

    expect(onPreflightError).toHaveBeenCalledWith(undefined);
    expect(iframe?.isConnected).toBe(false);
  });

  it('reports a generic error when the iframe response document is inaccessible', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => undefined);
    const onPreflightError = vi.fn();
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({ collectionIds: ['collection-a'], onPreflightError });

    const iframe = document.body.querySelector('iframe');
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      get: () => {
        throw new dom.window.DOMException('Blocked by same-origin policy', 'SecurityError');
      }
    });
    iframe?.dispatchEvent(new dom.window.Event('load'));

    expect(onPreflightError).toHaveBeenCalledWith(undefined);
    expect(iframe?.isConnected).toBe(false);
  });

  it('keeps pending downloads attached across owner unmount and uses independent targets', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => undefined);
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    const onSubmittingChange = vi.fn();
    submitter.submit({ collectionIds: ['collection-a'], onSubmittingChange });
    const firstIframe = document.body.querySelector('iframe');

    expect(document.body.querySelector('iframe')).not.toBeNull();

    submitter.cleanup();
    vi.advanceTimersByTime(600);
    expect(firstIframe?.isConnected).toBe(true);
    expect(onSubmittingChange).toHaveBeenCalledTimes(1);
    const remounted = createBatchDownloadDatasetCollectionsSubmitter();
    remounted.submit({ collectionIds: ['collection-b'] });
    const iframes = Array.from(document.body.querySelectorAll('iframe'));
    expect(iframes).toHaveLength(2);
    expect(iframes[0].name).not.toBe(iframes[1].name);

    firstIframe?.contentDocument?.body.append('{"code":422}');
    firstIframe?.dispatchEvent(new dom.window.Event('load'));
    expect(firstIframe?.isConnected).toBe(false);
    expect(iframes[1].isConnected).toBe(true);
  });

  it('removes a successful download iframe after the conservative cleanup window', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => undefined);
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    submitter.submit({ collectionIds: ['collection-a'] });
    const iframe = document.body.querySelector('iframe');

    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    expect(iframe?.isConnected).toBe(true);

    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(iframe?.isConnected).toBe(false);
  });

  it('rejects a repeated click until the short submission cooldown expires', () => {
    vi.useFakeTimers();
    const requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => undefined);
    const submitter = createBatchDownloadDatasetCollectionsSubmitter();

    expect(submitter.submit({ collectionIds: ['collection-a'] })).toBe(true);
    expect(submitter.submit({ collectionIds: ['collection-b'] })).toBe(false);
    expect(requestSubmit).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(600);

    expect(submitter.submit({ collectionIds: ['collection-b'] })).toBe(true);
    expect(requestSubmit).toHaveBeenCalledTimes(2);
  });
});
