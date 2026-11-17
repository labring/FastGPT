import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  DOCUMENT_ROOT,
  MODULE_ORDER,
  generateOpenApiDocs
} from './syncOpenApiDocs.mts';

const require = createRequire(import.meta.url);
const matter = require('gray-matter');
const { getAllDocLastModifiedTimes } = require('./initDocTime.js');

const HAN_REGEX = /\p{Script=Han}/u;

/** 锁定全部 50 个 System OpenAPI 接口的规范 URL Slug，防止 Tag 重命名或重构破坏已收录路径。 */
const LOCKED_OPERATION_SLUGS = {
  'POST /core/ai/model/summary': '/openapi/reference/model/summary',
  'GET /core/ai/model/list': '/openapi/reference/model/list',
  'GET /core/ai/model/catalog': '/openapi/reference/model/catalog',

  'POST /core/app/logs/list': '/openapi/reference/app-log/list',
  'GET /proApi/core/app/logs/getTotalData': '/openapi/reference/app-log/get-total-data',
  'POST /proApi/core/app/logs/getChartData': '/openapi/reference/app-log/get-chart-data',
  'POST /core/app/logs/getUsers': '/openapi/reference/app-log/get-users',

  'POST /v2/chat/completions': '/openapi/reference/chat-controller/v2-chat-completions',
  'POST /v2/chat/stop': '/openapi/reference/chat-controller/v2-chat-stop',
  'POST /v1/chat/completions': '/openapi/reference/chat-controller/v1-chat-completions',

  'POST /core/chat/history/getHistories': '/openapi/reference/chat-history/get-histories',
  'POST /core/chat/history/getHistoryStatus': '/openapi/reference/chat-history/get-history-status',
  'POST /core/chat/history/markRead': '/openapi/reference/chat-history/mark-read',
  'PUT /core/chat/history/updateHistory': '/openapi/reference/chat-history/update-history',
  'DELETE /core/chat/history/delHistory': '/openapi/reference/chat-history/del-history',
  'DELETE /core/chat/history/clearHistories': '/openapi/reference/chat-history/clear-histories',
  'POST /core/chat/history/batchDelete': '/openapi/reference/chat-history/batch-delete',
  'GET /core/chat/init': '/openapi/reference/chat-history/init',

  'POST /core/chat/record/getPaginationRecords':
    '/openapi/reference/chat-record/get-pagination-records',
  'POST /core/chat/record/getRecords_v2': '/openapi/reference/chat-record/get-records-v2',
  'GET /core/chat/record/getResData': '/openapi/reference/chat-record/get-res-data',
  'POST /core/chat/record/getQuote': '/openapi/reference/chat-record/get-quote',
  'POST /core/chat/record/getCollectionQuote':
    '/openapi/reference/chat-record/get-collection-quote',
  'DELETE /core/chat/record/delete': '/openapi/reference/chat-record/delete',

  'POST /core/chat/feedback/updateUserFeedback':
    '/openapi/reference/chat-feedback/update-user-feedback',

  'POST /core/dataset/create': '/openapi/reference/dataset/create',
  'POST /core/dataset/list': '/openapi/reference/dataset/list',
  'POST /core/dataset/listV2': '/openapi/reference/dataset/list-v2',
  'GET /core/dataset/detail': '/openapi/reference/dataset/detail',
  'DELETE /core/dataset/delete': '/openapi/reference/dataset/delete',
  'PUT /core/dataset/update': '/openapi/reference/dataset/update',
  'POST /core/dataset/batch/move': '/openapi/reference/dataset/batch-move',
  'POST /core/dataset/batch/delete': '/openapi/reference/dataset/batch-delete',

  'POST /core/dataset/collection/listV2': '/openapi/reference/dataset-collection/list-v2',
  'GET /core/dataset/collection/detail': '/openapi/reference/dataset-collection/detail',
  'POST /core/dataset/collection/update': '/openapi/reference/dataset-collection/update',
  'POST /core/dataset/collection/delete': '/openapi/reference/dataset-collection/delete',
  'POST /core/dataset/collection/getDownloadTicket':
    '/openapi/reference/dataset-collection/get-download-ticket',
  'GET /core/dataset/collection/batchDownload':
    '/openapi/reference/dataset-collection/batch-download',

  'POST /core/dataset/collection/create': '/openapi/reference/dataset-collection-create/create',
  'POST /core/dataset/collection/create/localFile':
    '/openapi/reference/dataset-collection-create/local-file',
  'POST /core/dataset/collection/create/link':
    '/openapi/reference/dataset-collection-create/link',
  'POST /core/dataset/collection/create/text':
    '/openapi/reference/dataset-collection-create/text',
  'POST /core/dataset/collection/create/apiCollection':
    '/openapi/reference/dataset-collection-create/api-collection',

  'POST /core/dataset/data/v2/list': '/openapi/reference/dataset-data/v2-list',
  'GET /core/dataset/data/detail': '/openapi/reference/dataset-data/detail',
  'PUT /core/dataset/data/update': '/openapi/reference/dataset-data/update',
  'DELETE /core/dataset/data/delete': '/openapi/reference/dataset-data/delete',
  'POST /core/dataset/data/pushData': '/openapi/reference/dataset-data/push-data',

  'POST /core/dataset/search': '/openapi/reference/dataset-search/search'
};

test('OpenAPI docs generator matches on-disk artifacts with zero drift and locks all 50 slugs', async () => {
  const bundle = await generateOpenApiDocs();

  // 1. 校验 50 个接口映射与 11 个模块顺序完全匹配锁定列表。
  assert.equal(Object.keys(LOCKED_OPERATION_SLUGS).length, 50);
  assert.equal(bundle.pages.length, 50);
  assert.equal(MODULE_ORDER.length, 11);

  const actualSlugMap = Object.fromEntries(bundle.pages.map((p) => [p.opKey, p.urlSlug]));
  assert.deepEqual(actualSlugMap, LOCKED_OPERATION_SLUGS);

  // 2. 校验中英文 OpenAPI 3.1 JSON 契约文件与磁盘完全一致，且英文版零汉字。
  const zhSpecDisk = fs.readFileSync(
    path.join(DOCUMENT_ROOT, 'data', 'openapi', 'systemopenapi.zh-CN.json'),
    'utf8'
  );
  const enSpecDisk = fs.readFileSync(
    path.join(DOCUMENT_ROOT, 'data', 'openapi', 'systemopenapi.en.json'),
    'utf8'
  );
  assert.equal(zhSpecDisk, bundle.zhSpecJson, 'systemopenapi.zh-CN.json drifted');
  assert.equal(enSpecDisk, bundle.enSpecJson, 'systemopenapi.en.json drifted');
  assert.ok(!HAN_REGEX.test(enSpecDisk), 'systemopenapi.en.json must not contain Han characters');

  const zhSpec = JSON.parse(zhSpecDisk);
  const enSpec = JSON.parse(enSpecDisk);
  assert.equal(zhSpec.openapi, '3.1.0');
  assert.equal(enSpec.openapi, '3.1.0');
  assert.deepEqual(
    zhSpec.servers.map((s) => s.url),
    ['https://cloud.fastgpt.cn/api', '/api']
  );
  assert.deepEqual(
    enSpec.servers.map((s) => s.url),
    ['https://cloud.fastgpt.io/api', '/api']
  );

  // 3. 校验 meta*.json（reference 与各模块均不得声明 root: true）。
  assert.equal(
    fs.readFileSync(path.join(DOCUMENT_ROOT, 'content', 'openapi', 'meta.json'), 'utf8'),
    bundle.openapiMetaZhJson
  );
  assert.equal(
    fs.readFileSync(path.join(DOCUMENT_ROOT, 'content', 'openapi', 'meta.en.json'), 'utf8'),
    bundle.openapiMetaEnJson
  );

  const refMetaZhPath = path.join(DOCUMENT_ROOT, 'content', 'openapi', 'reference', 'meta.json');
  const refMetaEnPath = path.join(DOCUMENT_ROOT, 'content', 'openapi', 'reference', 'meta.en.json');
  const refMetaZhDisk = fs.readFileSync(refMetaZhPath, 'utf8');
  const refMetaEnDisk = fs.readFileSync(refMetaEnPath, 'utf8');
  assert.equal(refMetaZhDisk, bundle.referenceMetaZhJson);
  assert.equal(refMetaEnDisk, bundle.referenceMetaEnJson);
  assert.equal(JSON.parse(refMetaZhDisk).root, undefined);
  assert.equal(JSON.parse(refMetaEnDisk).root, undefined);
  assert.ok(!HAN_REGEX.test(refMetaEnDisk), 'reference/meta.en.json contains Han characters');

  const expectedDiskPaths = new Set([
    'content/openapi/reference/meta.json',
    'content/openapi/reference/meta.en.json'
  ]);
  for (const modMeta of bundle.moduleMetas) {
    expectedDiskPaths.add(modMeta.relativePath);
    const diskContent = fs.readFileSync(path.join(DOCUMENT_ROOT, modMeta.relativePath), 'utf8');
    assert.equal(diskContent, modMeta.content, `Drifted meta file: ${modMeta.relativePath}`);
    assert.equal(JSON.parse(diskContent).root, undefined);
    if (modMeta.relativePath.endsWith('.en.json')) {
      assert.ok(!HAN_REGEX.test(diskContent), `${modMeta.relativePath} contains Han characters`);
    }
  }

  // 4. 校验全部 50 组（100 份）MDX 文档内容、前置门禁、零汉字、废弃状态与 SSE 示例静态展开。
  const docLastModified = JSON.parse(
    fs.readFileSync(path.join(DOCUMENT_ROOT, 'data', 'doc-last-modified.json'), 'utf8')
  );
  const commonSseEvents = [
    'answer',
    'fastAnswer',
    'flowNodeStatus',
    'toolCall',
    'toolParams',
    'toolResponse',
    'updateVariables',
    'workflowDuration',
    'chatTitle',
    'interactive',
    'planStatus',
    'plan',
    'skillCall',
    'sandboxStatus',
    'error'
  ];

  for (const page of bundle.pages) {
    expectedDiskPaths.add(page.zhPath);
    expectedDiskPaths.add(page.enPath);

    const zhDisk = fs.readFileSync(path.join(DOCUMENT_ROOT, page.zhPath), 'utf8');
    const enDisk = fs.readFileSync(path.join(DOCUMENT_ROOT, page.enPath), 'utf8');
    assert.equal(zhDisk, page.zhContent, `Drifted Chinese MDX: ${page.zhPath}`);
    assert.equal(enDisk, page.enContent, `Drifted English MDX: ${page.enPath}`);

    assert.ok(!HAN_REGEX.test(enDisk), `English MDX contains Han characters: ${page.enPath}`);
    assert.ok(docLastModified[page.zhPath], `Missing doc-last-modified entry for ${page.zhPath}`);
    assert.ok(docLastModified[page.enPath], `Missing doc-last-modified entry for ${page.enPath}`);

    const zhParsed = matter(zhDisk);
    const enParsed = matter(enDisk);
    assert.ok(String(zhParsed.data.seoTitle ?? '').includes('FastGPT OpenAPI'));
    assert.ok(String(enParsed.data.seoTitle ?? '').includes('FastGPT OpenAPI'));
    assert.ok(String(zhParsed.data.description ?? '').trim().length >= 20);
    const enDescLen = String(enParsed.data.description ?? '').trim().length;
    assert.ok(enDescLen >= 60 && enDescLen <= 160, `${page.enPath} desc len=${enDescLen}`);

    assert.ok(
      !/^#\s+/m.test(zhParsed.content.replace(/```[\s\S]*?```/g, '')),
      `H1 found in body of ${page.zhPath}`
    );
    assert.ok(
      !/^#\s+/m.test(enParsed.content.replace(/```[\s\S]*?```/g, '')),
      `H1 found in body of ${page.enPath}`
    );

    if (page.deprecated) {
      assert.equal(zhParsed.data.deprecated, true);
      assert.equal(enParsed.data.deprecated, true);
    }

    if (page.opKey === 'POST /v1/chat/completions') {
      assert.ok(zhDisk.includes('/zh-CN/openapi/reference/chat-controller/v2-chat-completions'));
      assert.ok(enDisk.includes('/en/openapi/reference/chat-controller/v2-chat-completions'));
      for (const evt of [...commonSseEvents, 'flowResponses']) {
        assert.ok(zhDisk.includes(`\`${evt}\``), `Missing v1 SSE event ${evt} in zh`);
        assert.ok(enDisk.includes(`\`${evt}\``), `Missing v1 SSE event ${evt} in en`);
      }
    }
    if (page.opKey === 'POST /v2/chat/completions') {
      for (const evt of [...commonSseEvents, 'flowNodeResponse']) {
        assert.ok(zhDisk.includes(`\`${evt}\``), `Missing v2 SSE event ${evt} in zh`);
        assert.ok(enDisk.includes(`\`${evt}\``), `Missing v2 SSE event ${evt} in en`);
      }
    }
  }

  // 5. 校验磁盘不存在多余残留文件。
  const referenceDir = path.join(DOCUMENT_ROOT, 'content', 'openapi', 'reference');
  for (const entry of fs.readdirSync(referenceDir, { recursive: true })) {
    const full = path.join(referenceDir, String(entry));
    if (!fs.statSync(full).isFile()) continue;
    const rel = path.relative(DOCUMENT_ROOT, full).split(path.sep).join('/');
    assert.ok(expectedDiskPaths.has(rel), `Unexpected stale file in reference/: ${rel}`);
  }
});

test('initDocTime preserves existing timestamps for uncommitted new MDX files', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fastgpt-initdoctime-'));
  try {
    const tempContentDir = path.join(tempRoot, 'content');
    const nestedDir = path.join(tempContentDir, 'openapi', 'reference', 'model');
    fs.mkdirSync(nestedDir, { recursive: true });
    const newDoc = path.join(nestedDir, 'list.mdx');
    fs.writeFileSync(newDoc, '---\ntitle: Test\n---\n', 'utf8');

    const expectedRel = path.relative(DOCUMENT_ROOT, newDoc).split(path.sep).join('/');
    const existingPath = path.join(tempRoot, 'doc-last-modified.json');
    const preservedTs = '2026-11-17T12:00:00+08:00';
    fs.writeFileSync(existingPath, JSON.stringify({ [expectedRel]: preservedTs }, null, 2), 'utf8');

    const result = getAllDocLastModifiedTimes(tempContentDir, existingPath);
    assert.equal(result[expectedRel], preservedTs);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
