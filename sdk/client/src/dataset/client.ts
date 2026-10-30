import type { HttpClient } from '../http';
import { FastGPTError } from '../error';
import type { RequestOptions, UploadFile, WaitOptions } from '../type';
import type { DatasetOperation, DatasetInput, DatasetOutput } from './type';
import { datasetOperations } from './operations';

type Execute = <Key extends DatasetOperation>(
  operation: Key,
  input: DatasetInput<Key>,
  options?: RequestOptions,
  upload?: UploadFile | UploadFile[]
) => Promise<DatasetOutput<Key>>;

/** Knowledge base chunks operations. */
export class DatasetChunks {
  constructor(private readonly execute: Execute) {}

  /** List chunks. */
  list(
    input: DatasetInput<'chunks.list'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'chunks.list'>> {
    return this.execute('chunks.list', input, options);
  }

  /** Get a chunk. */
  get(
    input: DatasetInput<'chunks.get'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'chunks.get'>> {
    return this.execute('chunks.get', input, options);
  }

  /** Update a chunk. */
  update(
    input: DatasetInput<'chunks.update'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'chunks.update'>> {
    return this.execute('chunks.update', input, options);
  }

  /** Delete a chunk. */
  delete(
    input: DatasetInput<'chunks.delete'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'chunks.delete'>> {
    return this.execute('chunks.delete', input, options);
  }

  /** Enqueue chunks for training. */
  push(
    input: DatasetInput<'chunks.push'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'chunks.push'>> {
    return this.execute('chunks.push', input, options);
  }
}

/** Knowledge base collections operations. */
export class DatasetCollections {
  constructor(private readonly execute: Execute) {}

  /** List collections. */
  list(
    input: DatasetInput<'collections.list'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.list'>> {
    return this.execute('collections.list', input, options);
  }

  /** Get a collection. */
  get(
    input: DatasetInput<'collections.get'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.get'>> {
    return this.execute('collections.get', input, options);
  }

  /** Create an empty collection or folder. */
  create(
    input: DatasetInput<'collections.create'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.create'>> {
    return this.execute('collections.create', input, options);
  }

  /** Update a collection. */
  update(
    input: DatasetInput<'collections.update'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.update'>> {
    return this.execute('collections.update', input, options);
  }

  /** Delete collections. */
  delete(
    input: DatasetInput<'collections.delete'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.delete'>> {
    return this.execute('collections.delete', input, options);
  }

  /** Import text. */
  importText(
    input: DatasetInput<'collections.importText'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.importText'>> {
    return this.execute('collections.importText', input, options);
  }

  /** Import a URL. */
  importUrl(
    input: DatasetInput<'collections.importUrl'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.importUrl'>> {
    return this.execute('collections.importUrl', input, options);
  }

  /** Upload a file. */
  importFile(
    input: DatasetInput<'collections.importFile'>,
    upload: UploadFile,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.importFile'>> {
    return this.execute('collections.importFile', input, options, upload);
  }

  /** Prepare collection download. */
  downloadTicket(
    input: DatasetInput<'collections.downloadTicket'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.downloadTicket'>> {
    return this.execute('collections.downloadTicket', input, options);
  }

  /** Download collection archive. */
  download(
    input: DatasetInput<'collections.download'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'collections.download'>> {
    return this.execute('collections.download', input, options);
  }

  /** 仅轮询公开的集合详情接口，等待训练完成；最终异常、取消及超时均明确报错。 */
  async waitForReady(
    input: DatasetInput<'collections.get'>,
    options: WaitOptions = {}
  ): Promise<DatasetOutput<'collections.get'>> {
    const waitTimeoutMs = options.waitTimeoutMs ?? 300000;
    const interval = options.pollIntervalMs ?? 1000;
    if (
      !Number.isSafeInteger(waitTimeoutMs) ||
      waitTimeoutMs < 1 ||
      waitTimeoutMs > 2147483647 ||
      !Number.isSafeInteger(interval) ||
      interval < 1 ||
      interval > 2147483647
    )
      throw new TypeError('Wait timeout and poll interval must be positive integers');
    const timeout = AbortSignal.timeout(waitTimeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    try {
      while (true) {
        signal.throwIfAborted();
        const status = await this.get(input, { signal, timeoutMs: options.timeoutMs });
        const { activeTrainingAmount, finalErrorAmount } = status;
        options.onProgress?.({ activeTrainingAmount, finalErrorAmount });
        if (finalErrorAmount > 0)
          throw new FastGPTError('Collection training failed', { kind: 'training' });
        if (activeTrainingAmount === 0) return status;
        await new Promise<void>((resolve, reject) => {
          const done = () => {
            signal.removeEventListener('abort', abort);
            resolve();
          };
          const timer = setTimeout(done, interval);
          const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            reject(signal.reason);
          };
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
      }
    } catch (error) {
      if (options.signal?.aborted)
        throw new FastGPTError('Waiting for training aborted', { kind: 'aborted' });
      if (timeout.aborted)
        throw new FastGPTError('Waiting for training timed out', { kind: 'timeout' });
      throw error;
    }
  }
}

/** FastGPT knowledge base resources. */
export class Datasets {
  readonly collections: DatasetCollections;
  readonly chunks: DatasetChunks;

  constructor(private readonly http: HttpClient) {
    this.chunks = new DatasetChunks(this.execute.bind(this));
    this.collections = new DatasetCollections(this.execute.bind(this));
  }

  /** 执行清单中的类型化操作，供 CLI 和通用集成使用；上传文件不混入 JSON 参数。 */
  async execute<Key extends DatasetOperation>(
    operation: Key,
    input: DatasetInput<Key>,
    options: RequestOptions = {},
    upload?: UploadFile | UploadFile[]
  ): Promise<DatasetOutput<Key>> {
    const spec = datasetOperations[operation];
    let form: FormData | undefined;
    if ('upload' in spec) {
      if (!upload) throw new TypeError('This operation requires a file');
      const files = Array.isArray(upload) ? upload : [upload];
      if (files.length === 0 || (spec.upload === 'file' && files.length !== 1))
        throw new TypeError('Invalid number of files');
      form = new FormData();
      form.set('data', JSON.stringify(input));
      for (const file of files) {
        // Node FormData 发送 UTF-8 filename，而服务端 multipart 解析器按 Latin-1 读取。
        // 沿用 FastGPT 已支持的 Unicode URI 编码约定；ASCII 字面百分号保持原样。
        const filename = new TextDecoder().decode(new TextEncoder().encode(file.filename));
        form.append(
          'file',
          file.file,
          /[^\x00-\x7f]/.test(filename) ? encodeURIComponent(filename) : filename
        );
      }
    } else if (upload) {
      throw new TypeError('This operation does not accept files');
    }
    // 默认值属于客户端便利行为，服务端旧版本仍要求这两个字段显式存在。
    const requestInput =
      operation === 'create'
        ? {
            ...input,
            type: (input as DatasetInput<'create'>).type ?? 'dataset',
            intro: (input as DatasetInput<'create'>).intro ?? ''
          }
        : input;
    const request = { method: spec.method, path: spec.path, input: requestInput, form };
    if ('download' in spec)
      return (await this.http.download(request, options)) as DatasetOutput<Key>;
    const result = await this.http.request<DatasetOutput<Key>>(request, options);
    return 'empty' in spec ? (undefined as DatasetOutput<Key>) : result;
  }

  /** List datasets. */
  list(input: DatasetInput<'list'> = {}, options?: RequestOptions): Promise<DatasetOutput<'list'>> {
    return this.execute('list', input, options);
  }

  /** Get a dataset. */
  get(input: DatasetInput<'get'>, options?: RequestOptions): Promise<DatasetOutput<'get'>> {
    return this.execute('get', input, options);
  }

  /** Create a dataset. */
  create(
    input: DatasetInput<'create'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'create'>> {
    return this.execute('create', input, options);
  }

  /** Delete a dataset. */
  delete(
    input: DatasetInput<'delete'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'delete'>> {
    return this.execute('delete', input, options);
  }

  /** Move datasets. */
  batchMove(
    input: DatasetInput<'batchMove'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'batchMove'>> {
    return this.execute('batchMove', input, options);
  }

  /** Delete datasets. */
  batchDelete(
    input: DatasetInput<'batchDelete'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'batchDelete'>> {
    return this.execute('batchDelete', input, options);
  }

  /** Search across datasets. */
  search(
    input: DatasetInput<'search'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'search'>> {
    return this.execute('search', input, options);
  }

  /** Test single-dataset search. */
  searchTest(
    input: DatasetInput<'searchTest'>,
    options?: RequestOptions
  ): Promise<DatasetOutput<'searchTest'>> {
    return this.execute('searchTest', input, options);
  }
}
