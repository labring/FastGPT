import { describe, expect, it } from 'vitest';
import { FastGPT } from '../src/index';

describe('Generated Domain Resources End-to-End Transport Coverage', () => {
  it('handles rawJson completionsV2 vs SSE completionsV2Stream dual-mode methods', async () => {
    const capturedBodies: Array<Record<string, unknown>> = [];

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-app-key',
      fetch: async (_url, init) => {
        const parsedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        capturedBodies.push(parsedBody);

        if (parsedBody.stream === true) {
          const encoder = new TextEncoder();
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'data: {"choices":[{"delta":{"content":"流式回复"}}]}\n\ndata: [DONE]\n\n'
                )
              );
              controller.close();
            }
          });
          return new Response(body, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' }
          });
        }

        // /v2/chat/completions 非流式直接返回顶层对象而非 NextAPI envelope
        return new Response(
          JSON.stringify({
            id: 'cmpl-1',
            choices: [{ index: 0, message: { role: 'assistant', content: '同步回复' } }]
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
    });

    const syncRes = await client.chat.completionsV2({
      chatId: 'c-1',
      messages: [{ role: 'user', content: '你好' }]
    });
    expect(capturedBodies[0]?.stream).toBe(false);
    expect(syncRes).toMatchObject({ id: 'cmpl-1' });

    const stream = await client.chat.completionsV2Stream({
      chatId: 'c-1',
      messages: [{ role: 'user', content: '你好' }]
    });
    expect(capturedBodies[1]?.stream).toBe(true);
    await expect(stream.finalText()).resolves.toBe('流式回复');
  });

  it('encodes both fileAndJsonData and flatFields multipart modes, octet-stream uploads, CSV text, binary ArrayBuffer, and void responses', async () => {
    const requests: Array<{
      url: string;
      method: string;
      headers: Headers;
      body: BodyInit | null | undefined;
    }> = [];

    const client = new FastGPT({
      baseUrl: 'https://api.example.com',
      apiKey: 'fastgpt-personal-key',
      defaultAppId: '68ad85a7463006c963799a05',
      fetch: async (input, init) => {
        const url = String(input);
        requests.push({
          url,
          method: init?.method ?? 'GET',
          headers: new Headers(init?.headers),
          body: init?.body
        });

        if (url.endsWith('/core/app/logs/exportLogs')) {
          return new Response('id,title\n1,hello\n', {
            status: 200,
            headers: { 'content-type': 'text/csv; charset=utf-8' }
          });
        }

        if (url.endsWith('/core/ai/sandbox/download')) {
          return new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' }
          });
        }

        if (url.endsWith('/core/chat/history/markRead')) {
          return new Response(
            JSON.stringify({ code: 200, statusText: '', message: '', data: null }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' }
            }
          );
        }

        return new Response(
          JSON.stringify({
            code: 200,
            statusText: '',
            message: '',
            data: { collectionId: 'col-1', results: { insertLen: 1 } }
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' }
          }
        );
      }
    });

    // 1. Multipart fileAndJsonData 模式（datasets.collections.createByLocalFile）
    await client.datasets.collections.createByLocalFile({
      datasetId: '68ad85a7463006c963799a01',
      trainingType: 'chunk',
      file: {
        data: '# Markdown Doc',
        filename: 'readme.md',
        contentType: 'text/markdown'
      }
    });
    const mpJsonForm = requests[0]?.body as FormData;
    expect(mpJsonForm).toBeInstanceOf(FormData);
    expect(mpJsonForm.get('file')).toBeInstanceOf(Blob);
    expect(JSON.parse(String(mpJsonForm.get('data')))).toEqual({
      datasetId: '68ad85a7463006c963799a01',
      trainingType: 'chunk'
    });

    // 2. Multipart flatFields 多文件数组模式（datasets.data.insertImages）
    await client.datasets.data.insertImages({
      collectionId: 'col-99',
      file: [new Uint8Array([1, 2]), new Uint8Array([3, 4])]
    });
    const mpFlatForm = requests[1]?.body as FormData;
    expect(mpFlatForm.get('collectionId')).toBe('col-99');
    expect(mpFlatForm.getAll('file')).toHaveLength(2);

    // 3. Path 参数 + Query 参数 + Octet-Stream 二进制直传（datasets.files.uploadPart）
    await client.datasets.files.uploadPart({
      token: 'upload/token+1',
      partNumber: 2,
      file: new Uint8Array([9, 8, 7])
    });
    expect(requests[2]?.method).toBe('PUT');
    expect(requests[2]?.url).toBe(
      'https://api.example.com/api/system/file/u/upload%2Ftoken%2B1?partNumber=2'
    );
    expect(requests[2]?.headers.get('content-type')).toBe('application/octet-stream');

    // 4. Text / CSV 下载（apps.logs.export）
    const csv = await client.apps.logs.export({
      dateStart: '2026-01-01T00:00:00Z',
      dateEnd: '2026-01-02T00:00:00Z',
      title: '导出日志',
      sourcesMap: { api: { label: 'API' } },
      logKeys: ['title']
    });
    expect(csv).toBe('id,title\n1,hello\n');

    // 5. Binary ArrayBuffer 下载（chat.sandbox.download）
    const zipBuf = await client.chat.sandbox.download({
      chatId: 'chat-sandbox-1',
      path: '/workspace'
    });
    expect(zipBuf).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(zipBuf))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    // 6. Void 响应（chat.histories.markRead）
    const voidRes = await client.chat.histories.markRead({ chatId: 'chat-1' });
    expect(voidRes).toBeUndefined();
  });
});
