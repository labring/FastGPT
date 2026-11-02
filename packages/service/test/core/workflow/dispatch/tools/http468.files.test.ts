import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import axios from 'axios';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  ContentTypes,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { UserConfigError } from '@fastgpt/global/common/error/utils';

const requestMock = vi.hoisted(() => vi.fn());
vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/api/axios')>()),
  axios: requestMock
}));
// The test receiver is deliberately local. Production retains the safe Axios boundary.
vi.mock('@fastgpt/service/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/utils')>()),
  isInternalAddress: async () => false
}));

import { dispatchHttp468Request } from '@fastgpt/service/core/workflow/dispatch/tools/http468';

const privateKey = 'chat/app/app-1/user-1/chat-1/report.pdf';
const fileUrl = 'https://files.example.com/signed-report.pdf';
const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 255, 128, 10]);

describe('HTTP node uploaded file forwarding', () => {
  let server: Server;
  let receiverUrl: string;
  const savedBuckets = global.s3BucketMap;
  const downloadObject = vi.fn();
  const getObjectMetadata = vi.fn();
  let received: Record<string, unknown>[];

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      try {
        const parts: Buffer[] = [];
        for await (const chunk of req) parts.push(Buffer.from(chunk));
        const request = new Request('https://receiver.example.com', {
          method: 'POST',
          headers: { 'content-type': req.headers['content-type']! },
          body: Buffer.concat(parts)
        });
        const data = await request.formData();
        const fields = await Promise.all(
          [...data].map(async ([key, value]) =>
            typeof value === 'string'
              ? { key, value }
              : {
                  key,
                  filename: value.name,
                  contentType: value.type,
                  bytes: [...new Uint8Array(await value.arrayBuffer())]
                }
          )
        );
        received.push({ fields });
        if (req.url === '/hold') return;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ fields }));
      } catch (error) {
        res.statusCode = 400;
        res.end(String(error));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing receiver address');
    receiverUrl = `http://127.0.0.1:${address.port}/upload`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  });

  beforeEach(() => {
    received = [];
    requestMock.mockReset().mockImplementation((config) => axios({ ...config, proxy: false }));
    getObjectMetadata.mockReset().mockResolvedValue({
      contentLength: bytes.length,
      contentType: 'application/pdf',
      metadata: { originFilename: encodeURIComponent('report.pdf') }
    });
    downloadObject.mockReset().mockImplementation(async () => ({ body: Readable.from([bytes]) }));
    global.s3BucketMap = {
      [S3Buckets.private]: { client: { getObjectMetadata, downloadObject } }
    } as any;
  });

  afterEach(() => {
    global.s3BucketMap = savedBuckets;
  });

  const buildProps = () => ({
    runningAppInfo: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
    chatId: 'chat-1',
    responseChatItemId: 'response-1',
    variableState: { toRuntimeRecord: () => ({ uploadedFile: fileUrl }) },
    checkIsStopping: () => false,
    node: { outputs: [] },
    runtimeNodesMap: new Map(),
    histories: [],
    params: {
      [NodeInputKeyEnum.httpReqUrl]: receiverUrl,
      [NodeInputKeyEnum.httpMethod]: 'POST',
      [NodeInputKeyEnum.httpContentType]: ContentTypes.formData,
      [NodeInputKeyEnum.httpFormBody]: [
        { key: 'file', type: 'file', value: '{{uploadedFile}}' },
        { key: 'note', type: 'string', value: 'keep text' }
      ]
    }
  });

  const createContext = (maxBytesPerFile = 1024) =>
    prepareWorkflowFileContext({
      query: [
        { file: { key: privateKey, url: fileUrl, type: ChatFileTypeEnum.file, name: 'report.pdf' } }
      ],
      histories: [],
      scope: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        uid: 'user-1',
        chatId: 'chat-1'
      },
      maxFileAmount: 5,
      maxBytesPerFile,
      getPreviewUrl: async () => fileUrl
    });

  it('sends binary bytes, filename and MIME alongside text through the real HTTP dispatcher', async () => {
    const { fileContext } = await createContext();
    const props = buildProps();
    props.params = JSON.parse(JSON.stringify(props.params));
    const snapshot = structuredClone(props.params);
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(props as any)
    );
    expect(result.error).toBeUndefined();
    expect(result.data?.[NodeOutputKeyEnum.httpRawResponse]).toEqual({
      fields: [
        { key: 'file', filename: 'report.pdf', contentType: 'application/pdf', bytes: [...bytes] },
        { key: 'note', value: 'keep text' }
      ]
    });
    expect(downloadObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: privateKey, abortSignal: expect.any(AbortSignal) })
    );
    expect(props.params).toEqual(snapshot);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.body).toEqual({
      file: { filename: 'report.pdf', contentType: 'application/pdf', size: bytes.length },
      note: 'keep text'
    });
  });

  it.each(['POST', 'PUT', 'PATCH'])(
    'uses a real multipart boundary for %s even with stale manual headers',
    async (method) => {
      const { fileContext } = await createContext();
      const props: any = buildProps();
      props.params[NodeInputKeyEnum.httpMethod] = method;
      props.params[NodeInputKeyEnum.httpHeaders] = [
        { key: 'content-type', value: 'application/json' },
        { key: 'CONTENT-LENGTH', value: '1' }
      ];
      const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
        dispatchHttp468Request(props)
      );
      expect(result.error).toBeUndefined();
      expect(received).toHaveLength(1);
      expect(result.data?.[NodeOutputKeyEnum.httpRawResponse].fields[0].bytes).toEqual([...bytes]);
    }
  );

  it.each(['no-context', 'unknown-url', 'unselected-child'])(
    'rejects %s without sending a request or reading a file',
    async (kind) => {
      const { fileContext } = await createContext();
      const props = buildProps();
      if (kind === 'unknown-url')
        props.params[NodeInputKeyEnum.httpFormBody][0].value =
          'https://other.example.com/private.pdf';
      const context =
        kind === 'unselected-child'
          ? await fileContext.derive([])
          : kind === 'no-context'
            ? undefined
            : fileContext;
      const result = await runWithContext({ mcpClientMemory: {}, fileContext: context }, () =>
        dispatchHttp468Request(props as any)
      );
      expect(result.rawError).toBeInstanceOf(UserConfigError);
      expect(downloadObject).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
    }
  );

  it('rejects a declared oversized object before opening its stream', async () => {
    const { fileContext } = await createContext(4);
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(buildProps() as any)
    );
    expect(result.rawError).toBeInstanceOf(UserConfigError);
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('maximum allowed size');
    expect(downloadObject).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('enforces the byte limit while reading, even when metadata understates the object size', async () => {
    const { fileContext } = await createContext(4);
    getObjectMetadata.mockResolvedValue({ contentLength: 1, contentType: 'application/pdf' });
    const stream = Readable.from([bytes]);
    downloadObject.mockResolvedValue({ body: stream });
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(buildProps() as any)
    );
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('maximum allowed size');
    expect(stream.destroyed).toBe(true);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('propagates source read failures through the HTTP error output without sending an incomplete body', async () => {
    const { fileContext } = await createContext();
    downloadObject.mockRejectedValue(new Error('object unavailable'));
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(buildProps() as any)
    );
    expect(result.rawError).toBeInstanceOf(UserConfigError);
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('object unavailable');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it.each(['stop', 'timeout'] as const)(
    'settles a stalled file read on %s and destroys the source stream',
    async (mode) => {
      const { fileContext } = await createContext();
      const stream = new Readable({ read() {} });
      let stopped = false;
      downloadObject.mockImplementation(async () => {
        if (mode === 'stop') stopped = true;
        return { body: stream };
      });
      const props: any = buildProps();
      props.checkIsStopping = () => stopped;
      props.params[NodeInputKeyEnum.httpTimeout] = mode === 'stop' ? 5 : 0.05;
      const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
        dispatchHttp468Request(props)
      );
      expect(result.rawError).toBeInstanceOf(UserConfigError);
      expect(result.error?.[NodeOutputKeyEnum.error]).toContain(
        mode === 'stop' ? 'stopped' : 'timed out'
      );
      expect(stream.destroyed).toBe(true);
      expect(requestMock).not.toHaveBeenCalled();
    }
  );

  it('does not open a stream when stopped during a pending metadata lookup', async () => {
    const { fileContext } = await createContext();
    let complete: (metadata: any) => void = () => {};
    let stopped = false;
    getObjectMetadata.mockImplementation(() => {
      stopped = true;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    const props = { ...buildProps(), checkIsStopping: () => stopped };
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(props as any)
    );
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('stopped');
    complete({ contentLength: bytes.length, contentType: 'application/pdf' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(downloadObject).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('keeps the text-only behavior of legacy and URL-encoded fields', async () => {
    for (const contentType of [ContentTypes.formData, ContentTypes.xWwwFormUrlencoded]) {
      const props: any = buildProps();
      props.params[NodeInputKeyEnum.httpContentType] = contentType;
      props.params[NodeInputKeyEnum.httpFormBody] = [{ key: 'file', value: fileUrl }];
      const result = await dispatchHttp468Request(props);
      expect(result.error).toBeUndefined();
      expect(result.data?.[NodeOutputKeyEnum.httpRawResponse]).toEqual({
        fields: [{ key: 'file', value: fileUrl }]
      });
    }
    expect(downloadObject).not.toHaveBeenCalled();
  });

  it('does not silently discard file fields on GET', async () => {
    const { fileContext } = await createContext();
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpMethod] = 'GET';
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(props as any)
    );
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('POST, PUT or PATCH');
    expect(downloadObject).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('forwards a userFiles URL array as repeated binary parts', async () => {
    const { fileContext } = await createContext();
    const props: any = buildProps();
    props.params[NodeInputKeyEnum.httpFormBody][0].value = '{{$start.userFiles$}}';
    props.runtimeNodesMap = new Map([
      [
        'start',
        {
          nodeId: 'start',
          inputs: [],
          outputs: [
            {
              id: NodeOutputKeyEnum.userFiles,
              value: [fileUrl, fileUrl],
              valueType: WorkflowIOValueTypeEnum.arrayString
            }
          ]
        }
      ]
    ]);
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(props)
    );
    expect(result.error).toBeUndefined();
    const fields = result.data?.[NodeOutputKeyEnum.httpRawResponse].fields;
    expect(fields.slice(0, 2).map((field: any) => field.bytes)).toEqual([[...bytes], [...bytes]]);
    expect(fields.map((field: any) => field.key)).toEqual(['file', 'file', 'note']);
  });

  it('applies the workflow file count limit to expanded arrays before any download', async () => {
    const { fileContext } = await createContext();
    const props: any = buildProps();
    props.variableState.toRuntimeRecord = () => ({ uploadedFile: Array(6).fill(fileUrl) });
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(props)
    );
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('file count');
    expect(downloadObject).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('preserves a file field named __proto__ in both multipart data and execution details', async () => {
    const { fileContext } = await createContext();
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpFormBody][0].key = '__proto__';
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(props as any)
    );
    expect(result.data?.[NodeOutputKeyEnum.httpRawResponse].fields[0]).toMatchObject({
      key: '__proto__',
      bytes: [...bytes]
    });
    expect(
      Object.hasOwn(result[DispatchNodeResponseKeyEnum.nodeResponse]!.body!, '__proto__')
    ).toBe(true);
  });

  it.each([
    { filename: '报告.pdf', contentType: 'application/pdf', expectedType: 'application/pdf' },
    { filename: 'report.bin', contentType: undefined, expectedType: 'application/octet-stream' }
  ])(
    'preserves filename $filename and resolves missing MIME safely',
    async ({ filename, contentType, expectedType }) => {
      const { fileContext } = await createContext();
      getObjectMetadata.mockResolvedValue({
        contentLength: bytes.length,
        contentType,
        metadata: { originFilename: encodeURIComponent(filename) }
      });
      const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
        dispatchHttp468Request(buildProps() as any)
      );
      expect(result.error).toBeUndefined();
      expect(result.data?.[NodeOutputKeyEnum.httpRawResponse].fields[0]).toMatchObject({
        filename,
        contentType: expectedType,
        bytes: [...bytes]
      });
    }
  );

  it('cancels an in-flight upload request after source reading completed', async () => {
    const { fileContext } = await createContext();
    const props = { ...buildProps(), checkIsStopping: () => received.length > 0 };
    props.params[NodeInputKeyEnum.httpReqUrl] = receiverUrl.replace('/upload', '/hold');
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(props as any)
    );
    expect(result.rawError).toBeInstanceOf(UserConfigError);
    expect(requestMock.mock.calls[0][0].signal.aborted).toBe(true);
    expect(received).toHaveLength(1);
  });

  it('bounds the aggregate file bytes before opening a second source', async () => {
    const { fileContext } = await createContext(10 * 1024 * 1024);
    const first = Buffer.alloc(6 * 1024 * 1024);
    getObjectMetadata.mockResolvedValue({ contentLength: first.length });
    downloadObject.mockImplementation(async () => ({ body: Readable.from([first]) }));
    const props: any = buildProps();
    props.variableState.toRuntimeRecord = () => ({ uploadedFile: [fileUrl, fileUrl] });
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(props)
    );
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('maximum allowed size');
    expect(downloadObject).toHaveBeenCalledTimes(1);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it.each(['[]', '[123]', '["broken"', ''])('rejects invalid file values %s', async (value) => {
    const { fileContext } = await createContext();
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpFormBody][0].value = value;
    const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
      dispatchHttp468Request(props as any)
    );
    expect(result.rawError).toBeInstanceOf(UserConfigError);
    expect(downloadObject).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });
});
