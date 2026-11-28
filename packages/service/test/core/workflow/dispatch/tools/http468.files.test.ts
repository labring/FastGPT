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
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/dispatch/context/file';
import {
  runWithTestWorkflowContext as runWithContext,
  createTestWorkflowDispatch
} from '@fastgpt/service/test/core/workflow/dispatch/context/fixtures';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import {
  HttpFileReadError,
  HTTP_MULTIPART_MAX_BYTES
} from '@fastgpt/service/core/workflow/dispatch/tools/httpFormData';
import { UserConfigError, UserError } from '@fastgpt/global/common/error/utils';

const requestMock = vi.hoisted(() => vi.fn());
const preflightMock = vi.hoisted(() => vi.fn());
vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/api/axios')>()),
  axios: requestMock
}));
// The test receiver is deliberately local. Production retains the safe Axios boundary.
vi.mock('@fastgpt/service/common/system/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/system/utils')>()),
  isInternalAddress: preflightMock
}));

import { dispatchHttp468Request as dispatchHttp468RequestWithoutContext } from '@fastgpt/service/core/workflow/dispatch/tools/http468';

const dispatchHttp468Request = createTestWorkflowDispatch(dispatchHttp468RequestWithoutContext);

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
  let receivedBytes = 0;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      try {
        if (req.url === '/early') {
          res.end('{"ok":true}');
          return;
        }
        const parts: Buffer[] = [];
        for await (const chunk of req) {
          receivedBytes += chunk.length;
          parts.push(Buffer.from(chunk));
        }
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
        if (req.url === '/redirect') {
          res.statusCode = 307;
          res.setHeader('location', '/upload');
        }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(req.url === '/small' ? { ok: true } : { fields }));
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
    receivedBytes = 0;
    preflightMock.mockReset().mockResolvedValue(false);
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
    variableContext: { toRuntimeRecord: () => ({ uploadedFile: fileUrl }) },
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
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
      () => dispatchHttp468Request(props as any)
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
      const result = await runWithContext(
        { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
        () => dispatchHttp468Request(props)
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
      // 新运行入口在进入节点前拒绝缺失的文件 Context。
      if (kind === 'no-context') {
        await expect(async () =>
          runWithContext(
            {
              mcpClientMemory: {},
              checkIsStopping: () => props.checkIsStopping(),
              fileContext: context
            },
            () => dispatchHttp468Request(props as any)
          )
        ).rejects.toThrow('Workflow file context is unavailable');
        expect(downloadObject).not.toHaveBeenCalled();
        expect(requestMock).not.toHaveBeenCalled();
        return;
      }
      const result = await runWithContext(
        {
          mcpClientMemory: {},
          checkIsStopping: () => props.checkIsStopping(),
          fileContext: context
        },
        () => dispatchHttp468Request(props as any)
      );
      expect(result.rawError).toBeInstanceOf(UserConfigError);
      expect(downloadObject).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
    }
  );

  it('rejects a declared oversized object before opening its stream', async () => {
    const { fileContext } = await createContext(4);
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(buildProps() as any)
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
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(buildProps() as any)
    );
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('maximum allowed size');
    expect(stream.destroyed).toBe(true);
    expect(received).toHaveLength(0);
  });

  it('preserves source I/O failures as system errors through Axios wrapping', async () => {
    const { fileContext } = await createContext();
    const failure = Object.assign(new Error('object unavailable'), { code: 'EMFILE' });
    downloadObject.mockRejectedValue(failure);
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(buildProps() as any)
    );
    expect(result.rawError).toBeInstanceOf(HttpFileReadError);
    expect(result.rawError?.cause).toBe(failure);
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('object unavailable');
    expect(received).toHaveLength(0);
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
      const result = await runWithContext(
        { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
        () => dispatchHttp468Request(props)
      );
      expect(result.rawError).toBeInstanceOf(UserConfigError);
      expect(result.error?.[NodeOutputKeyEnum.error]).toContain(
        mode === 'stop' ? 'stopped' : 'timed out'
      );
      expect(stream.destroyed).toBe(true);
      expect(received).toHaveLength(0);
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
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
      () => dispatchHttp468Request(props as any)
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

  it.each(
    [42, 0, false, null, { enabled: true }, [1, 2], undefined].flatMap((value) =>
      [false, true].map((withFile) => ({ value, withFile }))
    )
  )(
    'preserves native multipart text conversion for $value (file present: $withFile)',
    async ({ value, withFile }) => {
      const { fileContext } = await createContext();
      const props: any = buildProps();
      props.params[NodeInputKeyEnum.httpFormBody] = [
        ...(withFile ? props.params[NodeInputKeyEnum.httpFormBody].slice(0, 1) : []),
        { key: 'literal', value }
      ];
      const baseline = new FormData();
      baseline.append('literal', value as any);
      const result = await runWithContext(
        { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
        () => dispatchHttp468Request(props)
      );
      expect(result.error).toBeUndefined();
      expect(result.data?.[NodeOutputKeyEnum.httpRawResponse].fields.at(-1)).toEqual({
        key: 'literal',
        value: baseline.get('literal')
      });
      expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.body?.literal).toBe(
        baseline.get('literal')
      );
    }
  );

  it.each(['stop', 'timeout'] as const)(
    'settles a stalled outbound preflight on %s and never sends after late resolution',
    async (mode) => {
      const { fileContext } = await createContext();
      let completePreflight: (blocked: boolean) => void = () => {};
      let enteredPreflight: () => void = () => {};
      const entered = new Promise<void>((resolve) => {
        enteredPreflight = resolve;
      });
      preflightMock.mockImplementationOnce(() => {
        enteredPreflight();
        return new Promise<boolean>((resolve) => {
          completePreflight = resolve;
        });
      });
      let stopped = false;
      const props: any = buildProps();
      props.checkIsStopping = () => stopped;
      props.params[NodeInputKeyEnum.httpTimeout] = mode === 'timeout' ? 0.05 : 5;
      const pending = runWithContext(
        { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
        () => dispatchHttp468Request(props)
      );
      await entered;
      if (mode === 'stop') stopped = true;
      let guardTimer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([
        pending,
        new Promise<undefined>((resolve) => {
          guardTimer = setTimeout(resolve, 350);
        })
      ]);
      clearTimeout(guardTimer);
      // Always release the controlled DNS wait, including on the unpatched baseline.
      completePreflight(false);
      await pending;
      expect(result, 'dispatcher must settle while DNS is still pending').toBeDefined();
      expect(result?.error?.[NodeOutputKeyEnum.error]).toContain(
        mode === 'stop' ? 'stopped' : 'timed out'
      );
      expect(downloadObject).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
      expect(received).toHaveLength(0);
    }
  );

  it('keeps outbound SSRF rejection for file requests', async () => {
    const { fileContext } = await createContext();
    preflightMock.mockResolvedValue(true);
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(buildProps() as any)
    );
    expect(result.error).toBeDefined();
    expect(preflightMock).toHaveBeenCalledWith(receiverUrl);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('does not silently discard file fields on GET', async () => {
    const { fileContext } = await createContext();
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpMethod] = 'GET';
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
      () => dispatchHttp468Request(props as any)
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
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
      () => dispatchHttp468Request(props)
    );
    expect(result.error).toBeUndefined();
    const fields = result.data?.[NodeOutputKeyEnum.httpRawResponse].fields;
    expect(fields.slice(0, 2).map((field: any) => field.bytes)).toEqual([[...bytes], [...bytes]]);
    expect(fields.map((field: any) => field.key)).toEqual(['file', 'file', 'note']);
  });

  it('applies the workflow file count limit to expanded arrays before any download', async () => {
    const { fileContext } = await createContext();
    const props: any = buildProps();
    props.variableContext.toRuntimeRecord = () => ({ uploadedFile: Array(6).fill(fileUrl) });
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
      () => dispatchHttp468Request(props)
    );
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('file count');
    expect(downloadObject).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('preserves a file field named __proto__ in both multipart data and execution details', async () => {
    const { fileContext } = await createContext();
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpFormBody][0].key = '__proto__';
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
      () => dispatchHttp468Request(props as any)
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
      const result = await runWithContext(
        { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
        () => dispatchHttp468Request(buildProps() as any)
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
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
      () => dispatchHttp468Request(props as any)
    );
    expect(result.rawError).toBeInstanceOf(UserConfigError);
    expect(requestMock.mock.calls[0][0].signal.aborted).toBe(true);
    expect(received).toHaveLength(1);
  });

  it.each([4, 1024])(
    'streams an authorized external source with its actual byte quota %i',
    async (limit) => {
      const { fileContext } = await createContext();
      const stream = Readable.from([bytes]);
      const materialize = vi.fn();
      vi.spyOn(fileContext, 'getSource').mockResolvedValue({
        sourceKind: 'external',
        source: {
          kind: 'externalHttp',
          maxSizeBytes: limit,
          metadata: {},
          materialize,
          openStream: async () => ({
            stream,
            metadata: { filename: 'remote.pdf', contentType: 'application/pdf' }
          })
        }
      });
      const result = await runWithContext(
        { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
        () => dispatchHttp468Request(buildProps() as any)
      );
      expect(materialize).not.toHaveBeenCalled();
      expect(stream.destroyed).toBe(true);
      if (limit < bytes.length) {
        expect(result.rawError).toBeInstanceOf(UserConfigError);
        expect(received).toHaveLength(0);
      } else {
        expect(result.error).toBeUndefined();
        expect(received).toHaveLength(1);
      }
    }
  );

  it('classifies an explicit external source quota rejection as a configuration error', async () => {
    const { fileContext } = await createContext();
    vi.spyOn(fileContext, 'getSource').mockResolvedValue({
      sourceKind: 'external',
      source: {
        kind: 'externalHttp',
        maxSizeBytes: 4,
        metadata: {},
        materialize: vi.fn(),
        openStream: async () => {
          throw new UserError('File exceeds maximum allowed size (4 bytes)');
        }
      }
    });
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(buildProps() as any)
    );
    expect(result.rawError).toBeInstanceOf(UserConfigError);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('destroys a late external stream after cancellation during opening', async () => {
    const { fileContext } = await createContext();
    const stream = new Readable({ read() {} });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let stopped = false;
    vi.spyOn(fileContext, 'getSource').mockResolvedValue({
      sourceKind: 'external',
      source: {
        kind: 'externalHttp',
        maxSizeBytes: 1024,
        metadata: {},
        materialize: vi.fn(),
        openStream: async () => {
          stopped = true;
          await gate;
          return { stream, metadata: {} };
        }
      }
    });
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => stopped, fileContext },
      () => dispatchHttp468Request(buildProps() as any)
    );
    expect(result.rawError).toBeInstanceOf(UserConfigError);
    release();
    await vi.waitFor(() => expect(stream.destroyed).toBe(true));
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('sends the first chunks while the file source is still producing the rest', async () => {
    const { fileContext } = await createContext(1024 * 1024);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chunk = Buffer.alloc(64 * 1024, 65);
    getObjectMetadata.mockResolvedValue({ contentLength: chunk.length * 2 });
    const stream = Readable.from(
      (async function* () {
        yield chunk;
        await gate;
        yield chunk;
      })()
    );
    downloadObject.mockResolvedValue({ body: stream });
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpReqUrl] = receiverUrl.replace('/upload', '/small');
    const pending = runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(props as any)
    );
    try {
      await vi.waitFor(() => expect(receivedBytes).toBeGreaterThan(chunk.length));
      expect(received).toHaveLength(0);
    } finally {
      release();
    }
    const result = await pending;
    expect(result.error).toBeUndefined();
    expect(stream.destroyed).toBe(true);
  });

  it('retains a structured metadata I/O error as a system failure before sending', async () => {
    const { fileContext } = await createContext();
    const failure = Object.assign(new Error('metadata unavailable'), { code: 'EMFILE' });
    getObjectMetadata.mockRejectedValue(failure);
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(buildProps() as any)
    );
    expect(result.rawError).toBe(failure);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('keeps native FormData newline normalization for multipart text', async () => {
    const { fileContext } = await createContext();
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpFormBody][1].value = 'a\nb\rc\r\nd';
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(props as any)
    );
    expect(result.error).toBeUndefined();
    expect(received[0]).toMatchObject({
      fields: expect.arrayContaining([{ key: 'note', value: 'a\r\nb\r\nc\r\nd' }])
    });
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.body?.note).toBe('a\nb\rc\r\nd');
  });

  it('closes a still-producing source when the receiver responds early', async () => {
    const { fileContext } = await createContext();
    let started = false;
    const stream = new Readable({
      read() {
        if (!started) {
          started = true;
          this.push(bytes);
        }
      }
    });
    downloadObject.mockResolvedValue({ body: stream });
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpReqUrl] = receiverUrl.replace('/upload', '/early');
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(props as any)
    );
    expect(result.error).toBeUndefined();
    expect(stream.destroyed).toBe(true);
  });

  it('rejects a redirect instead of replaying a consumed upload stream', async () => {
    const { fileContext } = await createContext();
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpReqUrl] = receiverUrl.replace('/upload', '/redirect');
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
      () => dispatchHttp468Request(props as any)
    );
    expect(result.rawError).toBeInstanceOf(UserConfigError);
    expect(requestMock.mock.calls[0][0].maxRedirects).toBe(0);
    expect(received).toHaveLength(1);
  });

  it.each([1, 2])(
    'keeps a 1.5 MiB upload independent from a %i MiB response limit',
    async (responseLimit) => {
      const snapshot = getSystemInstanceConfig();
      const saved = snapshot.resource.serviceRequestMaxContentLength;
      snapshot.resource.serviceRequestMaxContentLength = responseLimit;
      try {
        const { fileContext } = await createContext(3 * 1024 * 1024);
        const payload = Buffer.alloc(1.5 * 1024 * 1024, 65);
        getObjectMetadata.mockResolvedValue({ contentLength: payload.length });
        downloadObject.mockResolvedValue({ body: Readable.from([payload]) });
        const props = buildProps();
        props.params[NodeInputKeyEnum.httpReqUrl] = receiverUrl.replace('/upload', '/small');
        const result = await runWithContext(
          { mcpClientMemory: {}, checkIsStopping: () => false, fileContext },
          () => dispatchHttp468Request(props as any)
        );
        expect(result.error).toBeUndefined();
        expect(requestMock.mock.calls[0][0].maxBodyLength).toBe(HTTP_MULTIPART_MAX_BYTES);
        expect(requestMock.mock.calls[0][0].maxContentLength).toBe(responseLimit * 1024 * 1024);
        expect(received).toHaveLength(1);
      } finally {
        snapshot.resource.serviceRequestMaxContentLength = saved;
      }
    }
  );

  it('rejects aggregate declared file bytes before opening any source', async () => {
    const { fileContext } = await createContext(HTTP_MULTIPART_MAX_BYTES);
    getObjectMetadata.mockResolvedValue({ contentLength: 60 * 1024 * 1024 });
    const props: any = buildProps();
    props.variableContext.toRuntimeRecord = () => ({ uploadedFile: [fileUrl, fileUrl] });
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
      () => dispatchHttp468Request(props)
    );
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('maximum allowed size');
    expect(downloadObject).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it.each(['[]', '[123]', '["broken"', ''])('rejects invalid file values %s', async (value) => {
    const { fileContext } = await createContext();
    const props = buildProps();
    props.params[NodeInputKeyEnum.httpFormBody][0].value = value;
    const result = await runWithContext(
      { mcpClientMemory: {}, checkIsStopping: () => props.checkIsStopping(), fileContext },
      () => dispatchHttp468Request(props as any)
    );
    expect(result.rawError).toBeInstanceOf(UserConfigError);
    expect(downloadObject).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });
});
