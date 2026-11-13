import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Blocked, runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import {
  createBuilderHarness,
  createProgram,
  documentChecksum
} from './workflow-builder.integration.mjs';

/**
 * FG-APP-WORKFLOW-053 的手动真实集成入口，沿用 052 的 fixture、secrets 和报告协议。
 * 只替代模型输出；业务全部经过 3000 → Pro3001 → Mongo/Redis/OpenSandbox/CLI/S3。
 * 原文、修订和任务目录从本轮真实索引及消息取得，不写 Mongo metadata，不使用私有库。
 * --describe 仅展示当前完整能力；实际场景由主代理先标记 running 后串行执行。
 */
const caseId = 'FG-APP-WORKFLOW-053';
const digest = (content) => createHash('sha256').update(content).digest('hex');
const marker = (label) => 'FG-TEST-' + label + '-' + randomBytes(8).toString('hex');
const sourceType = 'workflowBuilder';

export const capabilities = {
  C1: {
    name: '原始需求、两次修订和预览方案持久化',
    variants: ['本轮新直接任务 → 两次修订 → 本轮新 v1 预览 → 新请求工具重读'],
    assertions: [
      '超过 200 字的完整原始 Human value 和三段 marker 不被修订覆盖',
      '两次独立 responseChatItemId 的 requests 文件与实际 Human value 一致',
      '预览方案文件与真实工具参数一致，task/index/Mongo 归属一致',
      '新 HTTP/runtime 中实际 sandbox_read_file 完整重读原文、修订、计划及状态'
    ]
  },
  C2: {
    name: '直接任务 A → B → A 分片隔离与继续交付',
    variants: ['A/B 使用相同 chunkId 和不同回复值，各自真实 stage 后正常停止'],
    assertions: [
      'A/B 不同 taskId 和事务目录，真实分片内容及哈希独立',
      '切回 A 使用真实任务 ID，CLI 查询、最新 validate revision 和 commit 完整执行',
      '唯一候选只包含 A，Mongo/Sandbox/S3 一致，B 原文、状态和分片字节不变',
      '画布和发布版本保持 W0，finally 仅清理本轮资源'
    ]
  },
  C3: {
    name: '真实请求压缩、checkpoint 索引和新请求恢复交付',
    variants: ['本轮 A 预览确认草稿与 B 直接草稿 → 超阈值请求 → 新请求读回 A 并交付'],
    assertions: [
      '通过正常 API 只调整本轮临时 system 模型的 maxContext，真实压缩调用与 Mongo checkpoint 同时存在',
      'checkpoint 含服务端加入的 workflow_builder_task_index、实际目录和压缩时 taskId，最多五项',
      '完整资料留在文件，新请求真实 sandbox_read_file 读回 A 的完整原文/方案并交付 A',
      '系统提示词和工具 schema 哈希保持稳定，B 原文/状态/有效分片不变，W0 不变'
    ]
  },
  C4: {
    name: '本轮文件签名与合法旧快照回放安全',
    variants: [
      'payload 篡改不重签',
      '真实取消后回放同任务合法旧快照',
      '真实交付后回放同任务合法旧快照'
    ],
    assertions: [
      '签名错误经真实恢复请求明确失败，索引字节不变且不能发布空索引',
      '恢复原文件后经新 HTTP/runtime 的实际模型工具正常读取',
      '取消/交付事实以 Mongo 和真实聊天回执为准，合法旧签名不能恢复执行资格',
      '没有新增成功 stage、候选或版本，不覆写最新事实，finally 恢复本轮故障文件'
    ]
  }
};

/** 取同一会话的可信任务集合；当前槽与归档槽必须一致，不让镜像文件替代服务端事实。 */
function taskState(snapshot, taskId) {
  assert.equal(snapshot.chats.length, 1, '本轮应只有一个精确归属会话');
  const metadata = snapshot.chats[0].metadata;
  const tasks = Object.values(metadata.workflowBuilderTasks ?? {});
  const current = metadata.workflowBuilderTask;
  if (current) {
    const saved = tasks.find((task) => task.taskId === current.taskId);
    assert.deepEqual(saved, current, '当前任务槽与可信任务集合不一致');
  }
  const task = taskId ? tasks.find((task) => task.taskId === taskId) : current;
  assert.ok(task, '本轮可信任务不存在');
  return { task, tasks, current };
}

function candidateCards(snapshot) {
  return snapshot.items.flatMap((item) =>
    item.obj === 'AI'
      ? item.value
          .filter((value) => value.workflowBuilderVersion)
          .map((value) => ({
            dataId: item.dataId,
            version: value.workflowBuilderVersion
          }))
      : []
  );
}

function humanValue(round) {
  const human = round.snapshot.items.find(
    (item) => item.obj === 'Human' && item.dataId === round.responseChatItemId
  );
  assert.ok(human, '本轮真实 Human 消息未持久化');
  return human.value;
}

/** 新任务和后续修订都只改变一个明确业务字段；同 chunkId 用于检验替换与跨任务隔离。 */
function replyChunk({ text, task, chunkId = 'shared-reply' }) {
  return {
    task,
    action: 'upsert',
    chunk: {
      schemaVersion: 'fastgpt-workflow-chunk/v1',
      chunkId,
      commands: [{ type: 'input.set', nodeId: 'Reply', inputKey: 'text', value: text }]
    }
  };
}

/** 在上游实际收到成功 stage 回执后调用正常停止入口，不以断开客户端模拟后台停止。 */
async function stageAndStop({ h, app, content, text, task }) {
  let staged;
  let stopRecorded = false;
  const program = createProgram({
    steps: [
      {
        name: 'workflow_cli_stage',
        args: replyChunk({ text, task }),
        verify: async ({ json }) => {
          assert.equal(json?.ok, true);
          assert.equal(json.state, 'staged');
          assert.ok(json.taskId && json.taskPath);
          staged = json;
          assert.equal((await h.redisSnapshot(app)).leasePresent, true);
          const stopped = success(
            await h.http({
              route: '/api/v2/chat/stop',
              body: { sourceType, appId: app.appId, chatId: app.chatId }
            })
          );
          assert.equal(stopped.success, true, '正常停止入口未确认写入停止信号');
          assert.equal((await h.redisSnapshot(app)).stopPresent, true);
          stopRecorded = true;
          // StopController 每 100ms 读取 Redis；放行下一批 SSE 前留出一次完整读取周期。
          // 最终仍以真实 SSE/租约、持久化工具和无候选断言确认停止，不凭延时判断成功。
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    ],
    finalText: 'FG-TEST 正常停止同步信号'
  });
  const round = await h.chat({
    app,
    modelId: h.modelId,
    content,
    nextProgram: program,
    expectError: true
  });
  success(round.result);
  program.assertFinished();
  assert.equal(stopRecorded, true);
  assert.equal((await h.redisSnapshot(app)).leasePresent, false);
  assert.equal(round.result.events.filter((event) => event.event === 'interactive').length, 0);
  assert.equal(
    round.result.events.filter((event) => event.event === 'workflowBuilderVersion').length,
    0
  );
  assert.deepEqual(candidateCards(round.snapshot), []);
  const persisted = taskState(round.snapshot, staged.taskId).task;
  assert.equal(persisted.delivery, undefined, '停止后的草稿不能伪造成功交付');
  assert.ok(!persisted.cancelled, '正常停止不等于取消业务任务');
  assert.ok(
    round.snapshot.items.some(
      (item) =>
        item.obj === 'AI' &&
        item.value.some((value) =>
          value.tools?.some(
            (tool) =>
              tool.functionName === 'workflow_cli_stage' &&
              tool.response &&
              JSON.parse(tool.response).ok === true &&
              JSON.parse(tool.response).taskId === persisted.taskId
          )
        )
    ),
    '真实 stage 成功回执必须落入本轮消息'
  );
  await h.record('stage 成功后正常停止', {
    appId: app.appId,
    chatId: app.chatId,
    responseChatItemId: round.responseChatItemId,
    task: persisted,
    actualToolResults: program.results
  });
  return { ...round, task: persisted, stage: staged };
}

/** 从实际签名索引定位详情；目录不根据 taskId 猜测，也不把任务文件当作执行授权。 */
async function taskFiles({ h, app, taskId }) {
  const index = await h.readRemote(app, 'task-memory/index.json');
  assert.equal(index.json.payload.hasTasks, true);
  const entry = index.json.payload.tasks.find((entry) => entry.taskId === taskId);
  assert.ok(entry, '真实索引中缺少本轮任务');
  assert.match(entry.path, /^task-memory\/tasks\/[a-f0-9]{64}$/);
  const state = await h.readRemote(app, entry.path + '/task.json');
  assert.equal(state.json.payload.task.taskId, taskId);
  assert.ok(state.json.payload.revision > 0);
  const request = await h.readRemote(app, entry.path + '/request.md');
  const plan = entry.planFile ? await h.readRemote(app, entry.planFile) : undefined;
  if (plan) assert.equal(state.json.payload.planFile, entry.planFile);
  return { index, entry, state, request, plan };
}

/** 以实际 task-memory 目录名定位对应事务目录，再用 manifest 内的文件名读取真实分片。 */
async function draftFiles({ h, app, files, expectedText }) {
  const directory = '.fastgpt/workflow-builder/tasks/' + path.posix.basename(files.entry.path);
  const manifest = await h.readRemote(app, directory + '/chunks/manifest.json');
  assert.equal(manifest.json.taskId, files.entry.taskId);
  assert.equal(manifest.json.appId, app.appId);
  assert.equal(manifest.json.baseChecksum, app.checksum);
  assert.equal(manifest.json.chunks.length, 1);
  const entry = manifest.json.chunks[0];
  assert.equal(entry.chunkId, 'shared-reply');
  assert.equal(path.posix.basename(entry.fileName), entry.fileName);
  const chunk = await h.readRemote(app, directory + '/chunks/' + entry.fileName);
  assert.equal(chunk.sha256, entry.contentChecksum);
  assert.deepEqual(chunk.json.commands, replyChunk({ text: expectedText }).chunk.commands);
  return { directory, manifest, chunk };
}

/** 在下一次真实模型请求里检验 sandbox_read_file 回执完整内容，禁止只检查文件存在。 */
function readFileStep(relativePath, file) {
  assert.ok(Buffer.byteLength(file.content) < 50 * 1024, '完整读取变体需在真实工具 50KiB 限制内');
  assert.ok(file.content.split('\n').length < 2000);
  return {
    name: 'sandbox_read_file',
    args: { path: relativePath },
    verify: ({ raw }) => {
      assert.ok(
        raw.includes(file.content.trimEnd()),
        '模型工具没有完整读出已保存内容：' + relativePath
      );
      assert.ok(!raw.includes('[Showing lines '), '本场景不能把截断读取算作完整需求恢复');
    }
  };
}

/** 当前任务只读核验可解除本轮交付要求，但保留真实任务、预览与草稿。 */
function answerOnlyStep() {
  return {
    name: 'workflow_builder_answer_only',
    args: {},
    verify: ({ json }) => {
      assert.equal(json?.ok, true);
      assert.equal(json.state, 'answer_only');
    }
  };
}

/** 只检查明确值，不依赖 CLI 展示文案或未知层级。 */
function containsValue(value, expected) {
  if (value === expected) return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((entry) => containsValue(entry, expected));
}

/** 按服务端最新校验结果提交已有草稿，整个过程不再次 stage 或修改业务范围。 */
function deliveryProgram({ taskId, expectedText, forbiddenText, leadingSteps = [] }) {
  const finalText = 'FG-TEST 已交付恢复任务 ' + expectedText;
  const program = createProgram({
    steps: [
      ...leadingSteps,
      {
        name: 'workflow_cli_query',
        args: { task: { mode: 'continue', taskId }, view: 'draft', action: 'chunk_list' },
        verify: ({ json }) => {
          assert.equal(json?.ok, true);
          assert.equal(json.taskId, taskId);
          assert.equal(json.result.chunkCount, 1);
          assert.deepEqual(
            json.result.chunks.map((chunk) => chunk.chunkId),
            ['shared-reply']
          );
        }
      },
      {
        name: 'workflow_cli_query',
        args: { view: 'draft', action: 'input_show', nodeId: 'Reply', inputKey: 'text' },
        verify: ({ json }) => {
          assert.equal(json?.ok, true);
          assert.ok(containsValue(json.result, expectedText), '恢复的真实草稿不包含 A 的回复值');
          if (forbiddenText)
            assert.ok(!containsValue(json.result, forbiddenText), '恢复草稿串入 B 的回复值');
        }
      },
      {
        name: 'workflow_cli_query',
        args: { view: 'draft', action: 'validate' },
        verify: ({ json }) => {
          assert.equal(json?.ok, true);
          assert.equal(json.state, 'valid');
          assert.equal(json.command, 'draft validate');
          assert.match(json.draftRevision, /^sha256:[a-f0-9]{64}$/);
        }
      },
      {
        name: 'workflow_cli_commit',
        args: ({ results }) => ({ draftRevision: results.at(-1).json.draftRevision }),
        verify: ({ json }) => {
          assert.equal(json?.ok, true);
          assert.equal(json.state, 'candidate_ready');
          assert.equal(json.taskId, taskId);
          assert.equal(json.taskComplete, true);
          assert.ok(json.version?.s3Key);
        }
      }
    ],
    finalText
  });
  return { program, finalText };
}

/** 比较候选精确差集与真实 S3 归档，并检查任务/消息/SSE 三方交付事实。 */
async function assertDelivery({ h, app, round, taskId, expectedText, finalText }) {
  success(round.result);
  assert.ok(round.result.text.includes(finalText));
  assert.equal(round.result.events.filter((event) => event.event === 'interactive').length, 0);
  const events = round.result.events.filter((event) => event.event === 'workflowBuilderVersion');
  assert.equal(events.length, 1);
  const cards = candidateCards(round.snapshot);
  assert.equal(cards.length, 1);
  const version = events[0].data.version;
  assert.deepEqual(cards[0].version, version);
  assert.equal(cards[0].dataId, round.responseChatItemId);
  const task = taskState(round.snapshot, taskId).task;
  assert.deepEqual(task.delivery.version, version);
  assert.equal(task.delivery.responseChatItemId, round.responseChatItemId);
  const loaded = success(
    await h.http({
      route: '/api/proApi/core/workflow/builder/version/load',
      body: { appId: app.appId, chatId: app.chatId, responseChatItemId: round.responseChatItemId }
    })
  );
  assert.equal(loaded.source, 's3');
  assert.equal(loaded.checksum, version.checksum);
  const archived = await h.readArchive(app, version);
  assert.deepEqual(archived, loaded.document);
  const expected = structuredClone(app.document);
  expected.nodes
    .find((node) => node.nodeId === 'Reply')
    .inputs.find((input) => input.key === 'text').value = expectedText;
  assert.deepEqual(archived, expected, '恢复候选只能包含指定任务的回复文本变更');
  assert.equal(documentChecksum(archived), version.checksum);
  assert.deepEqual(await h.savedWorkflow(app), app.savedWorkflow, '不能自动应用或发布候选');
  return version;
}

/** C1：原文超过摘要上限，连续两次实际修订、预览和新 runtime 工具重读。 */
export async function requestPersistence(context) {
  const h = await createBuilderHarness(context);
  const app = await h.createApp('memory-C1');
  const sentinels = ['BEGIN', 'MIDDLE', 'END'].map(marker);
  const original = [
    sentinels[0],
    '请直接把 Reply.text 改为我指定的内容；本轮先暂存，收到停止后保留草稿，不生成候选。',
    '这是必须完整保存的原始需求。节点、连线、应用名称、简介和其他配置均保留。'.repeat(8),
    sentinels[1],
    '后续两轮允许替换回复文本，但不能覆盖最初需求；恢复时应读取完整原文。'.repeat(8),
    sentinels[2]
  ].join('\n');
  assert.ok(original.length > 200);
  const values = [marker('C1-initial'), marker('C1-revision-1'), marker('C1-revision-2')];
  const first = await stageAndStop({
    h,
    app,
    content: original + '\n原始指定回复：' + values[0],
    text: values[0],
    task: { mode: 'new' }
  });
  const initial = await taskFiles({ h, app, taskId: first.task.taskId });
  assert.equal(first.task.schemaVersion, 2);
  assert.ok(first.task.requestSummary.length <= 200);
  assert.deepEqual(JSON.parse(initial.request.content), humanValue(first));
  for (const sentinel of sentinels) assert.ok(initial.request.content.includes(sentinel));
  const revisions = [];
  for (const [index, text] of values.slice(1).entries()) {
    const content =
      '明确继续 taskId=' +
      first.task.taskId +
      '。第 ' +
      (index + 1) +
      ' 次修订：只把 Reply.text 改为 ' +
      text +
      '；本轮暂存后停止，保留草稿。';
    const round = await stageAndStop({
      h,
      app,
      content,
      text,
      task: { mode: 'continue', taskId: first.task.taskId }
    });
    assert.equal(round.task.requestChatItemId, first.task.requestChatItemId);
    const files = await taskFiles({ h, app, taskId: first.task.taskId });
    assert.equal(files.request.sha256, initial.request.sha256, '后续请求覆盖了完整原始需求');
    const relative = files.entry.path + '/requests/' + digest(round.responseChatItemId) + '.md';
    const file = await h.readRemote(app, relative);
    assert.deepEqual(JSON.parse(file.content), humanValue(round));
    revisions.push({ round, relative, file });
  }
  assert.notEqual(revisions[0].round.responseChatItemId, revisions[1].round.responseChatItemId);
  const beforePreview = await taskFiles({ h, app, taskId: first.task.taskId });
  await draftFiles({ h, app, files: beforePreview, expectedText: values[2] });

  const payload = {
    task: { mode: 'continue', taskId: first.task.taskId },
    title: 'FG-TEST 完整任务记忆方案',
    summary: '保留全部原文与修订，最终只将 Reply.text 改为 ' + values[2] + '。',
    mermaid: 'flowchart TD\n  Start[输入] --> Reply[指定回复]',
    sections: [
      { title: '原文与最终修订', content: sentinels.join('\n') + '\n最终回复：' + values[2] }
    ]
  };
  const preview = await h.chat({
    app,
    modelId: h.modelId,
    content: '继续同一任务 ' + first.task.taskId + '，把已有草稿整理为待确认方案，本轮只展示预览。',
    nextProgram: createProgram({
      steps: [{ name: 'workflow_builder_present_preview', args: payload }],
      stopAtEnd: true
    })
  });
  const pending = taskState(preview.snapshot, first.task.taskId).task;
  assert.equal(pending.schemaVersion, 1, '本轮新预览任务应使用 v1，不作为旧版本排除');
  assert.equal(pending.requestChatItemId, first.task.requestChatItemId);
  assert.deepEqual(candidateCards(preview.snapshot), []);
  const interactive = preview.result.events.filter((event) => event.event === 'interactive');
  assert.equal(interactive.length, 1);
  assert.equal(interactive[0].data.interactive.type, 'workflowBuilderPreview');
  const files = await taskFiles({ h, app, taskId: first.task.taskId });
  assert.equal(files.request.sha256, initial.request.sha256);
  assert.ok(files.plan, '真实预览必须保存完整方案文件');
  assert.deepEqual(JSON.parse(files.plan.content), payload);
  const reread = [
    [files.entry.path + '/request.md', files.request],
    [files.entry.path + '/task.json', files.state],
    ...revisions.map((revision) => [revision.relative, revision.file]),
    [files.entry.planFile, files.plan]
  ];
  const finalText = marker('C1-read-complete');
  const readRound = await h.chat({
    app,
    modelId: h.modelId,
    content: '本轮只核对任务 ' + first.task.taskId + ' 的原文、修订和方案文件，不执行搭建。',
    nextProgram: createProgram({
      steps: [answerOnlyStep(), ...reread.map(([relative, file]) => readFileStep(relative, file))],
      finalText
    })
  });
  assert.ok(readRound.result.text.includes(finalText));
  assert.deepEqual(candidateCards(readRound.snapshot), []);
  const restored = await taskFiles({ h, app, taskId: first.task.taskId });
  assert.equal(restored.request.sha256, initial.request.sha256);
  assert.equal(restored.plan.sha256, files.plan.sha256);
  assert.equal(restored.state.sha256, files.state.sha256, '仅重新读取资料不能重写任务记录');
  for (const { relative, file } of revisions)
    assert.equal((await h.readRemote(app, relative)).sha256, file.sha256);
  assert.deepEqual(await h.savedWorkflow(app), app.savedWorkflow);
  await h.record('C1 完整断言完成', {
    taskId: first.task.taskId,
    sentinels,
    originalRequestSha256: initial.request.sha256,
    revisionResponseIds: revisions.map(({ round }) => round.responseChatItemId),
    plan: files.entry.planFile,
    newRuntimeResponseId: readRound.responseChatItemId
  });
  return '完整原始 Human value、两次独立修订、真实新 v1 预览方案与 Mongo/远端文件一致；新 HTTP/runtime 经实际 sandbox_read_file 完整重读，原文和资料字节不变，未生成候选或修改 W0。';
}

/** C2：相同 chunkId 的 A/B 分片真实隔离，切回 A 后只交付 A，B 逐字节保持。 */
export async function taskIsolation(context) {
  const h = await createBuilderHarness(context);
  const app = await h.createApp('memory-C2');
  const textA = marker('task-A');
  const textB = marker('task-B');
  const a = await stageAndStop({
    h,
    app,
    content: '新建独立任务 A：直接将 Reply.text 改为 ' + textA + '；先暂存后停止。',
    text: textA,
    task: { mode: 'new' }
  });
  const aFiles = await taskFiles({ h, app, taskId: a.task.taskId });
  const aDraft = await draftFiles({ h, app, files: aFiles, expectedText: textA });
  const b = await stageAndStop({
    h,
    app,
    content: '这是独立新任务 B，不继续 A：直接将 Reply.text 改为 ' + textB + '；先暂存后停止。',
    text: textB,
    task: { mode: 'new' }
  });
  assert.notEqual(a.task.taskId, b.task.taskId);
  const bFiles = await taskFiles({ h, app, taskId: b.task.taskId });
  const bDraft = await draftFiles({ h, app, files: bFiles, expectedText: textB });
  assert.notEqual(aFiles.entry.path, bFiles.entry.path);
  assert.notEqual(aDraft.directory, bDraft.directory);
  const aAfterB = await taskFiles({ h, app, taskId: a.task.taskId });
  assert.equal(aAfterB.request.sha256, aFiles.request.sha256);
  assert.equal(aAfterB.state.sha256, aFiles.state.sha256);
  const aDraftAfterB = await draftFiles({ h, app, files: aAfterB, expectedText: textA });
  assert.equal(aDraftAfterB.manifest.sha256, aDraft.manifest.sha256);
  assert.equal(aDraftAfterB.chunk.sha256, aDraft.chunk.sha256);
  const delivery = deliveryProgram({
    taskId: a.task.taskId,
    expectedText: textA,
    forbiddenText: textB
  });
  const round = await h.chat({
    app,
    modelId: h.modelId,
    content:
      '明确继续任务 A，taskId=' + a.task.taskId + '；复用 A 的已有分片校验并交付，不执行 B。',
    nextProgram: delivery.program
  });
  const version = await assertDelivery({
    h,
    app,
    round,
    taskId: a.task.taskId,
    expectedText: textA,
    finalText: delivery.finalText
  });
  const current = taskState(round.snapshot, a.task.taskId);
  assert.equal(current.tasks.length, 2);
  assert.equal(current.current.taskId, a.task.taskId);
  assert.deepEqual(
    taskState(round.snapshot, b.task.taskId).task,
    b.task,
    '切回 A 改写了 B 的可信事实'
  );
  const bAfter = await taskFiles({ h, app, taskId: b.task.taskId });
  assert.equal(bAfter.entry.active, true);
  assert.equal(bAfter.request.sha256, bFiles.request.sha256);
  assert.equal(bAfter.state.sha256, bFiles.state.sha256);
  const bDraftAfter = await draftFiles({ h, app, files: bAfter, expectedText: textB });
  assert.equal(bDraftAfter.manifest.sha256, bDraft.manifest.sha256);
  assert.equal(bDraftAfter.chunk.sha256, bDraft.chunk.sha256);
  await h.record('C2 完整断言完成', {
    appId: app.appId,
    chatId: app.chatId,
    taskA: a.task.taskId,
    taskB: b.task.taskId,
    aDirectory: aDraft.directory,
    bDirectory: bDraft.directory,
    bRequestSha256: bAfter.request.sha256,
    bManifestSha256: bDraftAfter.manifest.sha256,
    bChunkSha256: bDraftAfter.chunk.sha256,
    version
  });
  return 'A/B 在真实 stage 后分别正常停止，taskId 和事务目录隔离；继续 A 复用原分片，经真实 CLI validate/commit 交付唯一 S3 候选；B 的可信状态、原文和分片字节保持，W0 未修改。';
}

/**
 * 只为本轮故障文件创建独立 provider 连接，不要求修改共享 harness。
 * 原生 SDK 只改明确定位的 task.json；认证、会话、CLI 和可信事实仍走真实产品入口。
 */
async function writableTaskFile({ context, h, app, files }) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
  const serviceRequire = createRequire(path.join(root, 'packages/service/package.json'));
  const sdkRequire = createRequire(path.join(root, 'sdk/sandbox-adapter/package.json'));
  const { ObjectId } = serviceRequire('mongoose').mongo;
  const query = {
    _id: new ObjectId(app.appId),
    teamId: new ObjectId(context.fixture.teamId),
    name: app.name
  };
  assert.ok(app.name.startsWith('FG-TEST-'));
  assert.ok(
    await (await h.c.database()).collection('apps').findOne(query, { projection: { _id: 1 } })
  );
  const owner = { sourceType, sourceId: app.appId, userId: h.c.actor('owner').tmbId };
  const instance = await (await h.c.database())
    .collection('agent_sandbox_instances_v3')
    .findOne(owner);
  assert.ok(instance && instance.sandboxId);
  if (instance.teamId) assert.equal(instance.teamId, context.fixture.teamId);
  const filename =
    '/workspace/sessions/' + encodeURIComponent(app.chatId) + '/' + files.entry.path + '/task.json';
  assert.equal(files.state.filename, filename, '故障目标必须是本轮索引定位的 task.json');
  const { ConnectionConfig, SandboxManager, Sandbox } = await import(
    pathToFileURL(sdkRequire.resolve('@alibaba-group/opensandbox')).href
  );
  const apiKey = process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY;
  assert.ok(apiKey);
  context.secrets.add(apiKey);
  const connectionConfig = new ConnectionConfig({
    domain: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
    apiKey,
    useServerProxy: true,
    requestTimeoutSeconds: 30
  });
  const manager = SandboxManager.create({ connectionConfig });
  let remote;
  try {
    const page = await manager.listSandboxInfos({
      metadata: { sessionId: instance.sandboxId },
      page: 1,
      pageSize: 100
    });
    assert.equal(page.items.length, 1);
    assert.ok(!page.pagination?.hasNextPage);
    assert.equal(page.items[0].metadata?.sessionId, instance.sandboxId);
    remote = await Sandbox.connect({ sandboxId: page.items[0].id, connectionConfig });
    await h.record('本轮故障文件写入范围', {
      appId: app.appId,
      chatId: app.chatId,
      taskId: files.entry.taskId,
      owner,
      filename,
      logicalId: instance.sandboxId,
      physicalId: page.items[0].id
    });
  } finally {
    await manager.close();
  }
  context.itemFinalizers.push(() => remote.close());
  return {
    async write(content, reason) {
      assert.equal(
        (await h.redisSnapshot(app)).leasePresent,
        false,
        '故障文件仅在本轮生成收尾后修改'
      );
      const envelope = JSON.parse(content);
      assert.equal(envelope.payload.task.taskId, files.entry.taskId);
      context.secrets.add(envelope.signature);
      await remote.files.writeFiles([{ path: filename, data: content }]);
      const actual = await h.readRemote(app, files.entry.path + '/task.json');
      assert.equal(actual.sha256, digest(content));
      await h.record('本轮故障文件实际写入', {
        reason,
        filename,
        bytes: Buffer.byteLength(content),
        sha256: actual.sha256,
        payload: envelope.payload
      });
      return actual;
    }
  };
}

/** 收敛比较本轮成功变更事实，不把新增失败聊天或实际用量错误地要求为零。 */
function successfulMutations(snapshot) {
  return snapshot.items.flatMap((item) =>
    item.obj !== 'AI'
      ? []
      : item.value.flatMap((value) =>
          (value.tools ?? []).flatMap((tool) => {
            if (
              !['workflow_cli_stage', 'workflow_cli_commit'].includes(tool.functionName) ||
              !tool.response
            )
              return [];
            let response;
            try {
              response = JSON.parse(tool.response);
            } catch {
              return [];
            }
            return response.ok === true
              ? [{ dataId: item.dataId, functionName: tool.functionName, response }]
              : [];
          })
        )
  );
}

function trustedFacts(snapshot) {
  assert.equal(snapshot.chats.length, 1);
  return {
    current: snapshot.chats[0].metadata.workflowBuilderTask,
    tasks: snapshot.chats[0].metadata.workflowBuilderTasks,
    mutations: successfulMutations(snapshot),
    candidates: candidateCards(snapshot)
  };
}

/** 回放之后显式请求继续并实际尝试 stage；错误必须来自可信终止事实，而非签名/参数错误。 */
async function rejectReplay({ h, app, taskId, before, terminal }) {
  let rejected;
  const finalText = marker('replay-rejected');
  const program = createProgram({
    steps: [
      {
        name: 'workflow_cli_stage',
        args: replyChunk({ text: marker('must-not-stage'), task: { mode: 'continue', taskId } }),
        verify: ({ json, raw }) => {
          assert.equal(json?.ok, false, '有效旧签名错误地恢复了执行资格');
          assert.ok(
            /already cancelled or delivered|cannot be continued|已取消|已交付|不能继续/i.test(raw),
            '拒绝必须来自真实取消/交付事实'
          );
          assert.ok(!/signature does not match/i.test(raw), '合法回放不能用无效签名代替资格边界');
          rejected = { json, raw };
        }
      }
    ],
    finalText
  });
  const round = await h.chat({
    app,
    modelId: h.modelId,
    content: '继续本轮旧任务 taskId=' + taskId + '，尝试修改回复并交付。',
    nextProgram: program
  });
  assert.ok(rejected);
  assert.ok(round.result.text.includes(finalText));
  assert.equal(
    round.result.events.filter((event) => event.event === 'workflowBuilderVersion').length,
    0
  );
  assert.equal(round.result.events.filter((event) => event.event === 'interactive').length, 0);
  assert.deepEqual(
    trustedFacts(round.snapshot),
    trustedFacts(before),
    '回放改变了最新可信事实或产生新成功变更/候选'
  );
  const task = taskState(round.snapshot, taskId).task;
  if (terminal === 'cancelled') assert.equal(task.cancelled, true);
  else assert.ok(task.delivery?.version);
  await h.record('合法旧签名回放被可信事实拒绝', {
    terminal,
    taskId,
    rejection: rejected,
    facts: trustedFacts(round.snapshot)
  });
  return round;
}

/** C4：三个独立新任务；失败后仍恢复最新正确字节，绝不替换 Mongo 任务事实。 */
export async function signatureAndReplay(context) {
  const h = await createBuilderHarness(context);
  for (const variant of ['tampered-payload', 'cancelled-replay', 'delivered-replay']) {
    const app = await h.createApp('memory-C4-' + variant);
    const text = marker(variant);
    const seed = await stageAndStop({
      h,
      app,
      content: '独立新任务：将 Reply.text 改为 ' + text + '；先暂存后停止。',
      text,
      task: { mode: 'new' }
    });
    const early = await taskFiles({ h, app, taskId: seed.task.taskId });
    const writer = await writableTaskFile({ context, h, app, files: early });
    let restoration = early.state.content;
    let dirty = false;
    const restore = async () => {
      if (!dirty) return;
      await writer.write(restoration, 'finally 恢复本轮最新正确文件');
      dirty = false;
    };
    context.itemFinalizers.push(restore);
    try {
      if (variant === 'tampered-payload') {
        const tampered = JSON.parse(early.state.content);
        tampered.payload.summary = marker('unsigned-payload-change');
        dirty = true;
        await writer.write(
          JSON.stringify(tampered, null, 2) + '\n',
          '只修改 payload，不计算或更新签名'
        );
        let modelCalls = 0;
        const before = await h.snapshot(app);
        const failed = await h.chat({
          app,
          modelId: h.modelId,
          content: '恢复本轮任务 ' + seed.task.taskId + ' 并继续。',
          expectError: true,
          nextProgram: {
            async respond() {
              modelCalls++;
              return { content: 'FG-TEST unexpected model request after signature failure' };
            },
            assertFinished() {}
          }
        });
        assert.equal(failed.result.error, true, '篡改恢复请求必须明确失败');
        assert.ok(
          /signature does not match/i.test(JSON.stringify(failed.result)),
          '未观察到真实文件签名错误'
        );
        assert.equal(modelCalls, 0, '签名失败应在模型和执行资格选择之前终止');
        assert.deepEqual(trustedFacts(failed.snapshot), trustedFacts(before));
        const index = await h.readRemote(app, 'task-memory/index.json');
        assert.equal(index.sha256, early.index.sha256, '签名错误被错误当作空仓库发布了新索引');
        assert.equal(index.json.payload.hasTasks, true);
        assert.ok(index.json.payload.tasks.some((entry) => entry.taskId === seed.task.taskId));
        await restore();
        const restored = await taskFiles({ h, app, taskId: seed.task.taskId });
        assert.equal(restored.state.sha256, early.state.sha256);
        const finalText = marker('valid-signature-restored');
        const readable = await h.chat({
          app,
          modelId: h.modelId,
          content: '本轮仅读取已恢复的任务文件，不继续搭建。',
          nextProgram: createProgram({
            steps: [
              answerOnlyStep(),
              readFileStep(restored.entry.path + '/task.json', restored.state)
            ],
            finalText
          })
        });
        assert.ok(readable.result.text.includes(finalText));
        assert.deepEqual(trustedFacts(readable.snapshot), trustedFacts(before));
      } else {
        let terminalRound;
        if (variant === 'cancelled-replay') {
          terminalRound = await h.chat({
            app,
            modelId: h.modelId,
            content: '明确取消当前任务 ' + seed.task.taskId + '，不交付候选。',
            nextProgram: createProgram({
              steps: [{ name: 'workflow_builder_cancel', args: {} }],
              stopAtEnd: true
            })
          });
          assert.equal(taskState(terminalRound.snapshot, seed.task.taskId).task.cancelled, true);
          assert.deepEqual(candidateCards(terminalRound.snapshot), []);
          assert.ok(
            terminalRound.snapshot.items.some(
              (item) =>
                item.obj === 'AI' &&
                item.value.some((value) =>
                  value.tools?.some(
                    (tool) =>
                      tool.functionName === 'workflow_builder_cancel' &&
                      tool.response &&
                      JSON.parse(tool.response).state === 'cancelled'
                  )
                )
            ),
            '取消必须有真实聊天工具回执'
          );
        } else {
          const delivery = deliveryProgram({ taskId: seed.task.taskId, expectedText: text });
          terminalRound = await h.chat({
            app,
            modelId: h.modelId,
            content: '明确继续 taskId=' + seed.task.taskId + '，完成校验和交付。',
            nextProgram: delivery.program
          });
          await assertDelivery({
            h,
            app,
            round: terminalRound,
            taskId: seed.task.taskId,
            expectedText: text,
            finalText: delivery.finalText
          });
        }
        const latest = await taskFiles({ h, app, taskId: seed.task.taskId });
        assert.notEqual(latest.state.sha256, early.state.sha256);
        restoration = latest.state.content;
        dirty = true;
        await writer.write(early.state.content, '回放同一新任务较早合法签名快照');
        await rejectReplay({
          h,
          app,
          taskId: seed.task.taskId,
          before: terminalRound.snapshot,
          terminal: variant === 'cancelled-replay' ? 'cancelled' : 'delivered'
        });
        assert.equal(
          (await h.readRemote(app, 'task-memory/index.json')).sha256,
          latest.index.sha256
        );
        await restore();
        assert.equal(
          (await taskFiles({ h, app, taskId: seed.task.taskId })).state.sha256,
          latest.state.sha256
        );
      }
      assert.deepEqual(await h.savedWorkflow(app), app.savedWorkflow);
      await h.record('C4 完整变体通过', {
        variant,
        appId: app.appId,
        chatId: app.chatId,
        taskId: seed.task.taskId,
        restoredSha256: digest(restoration)
      });
    } finally {
      await restore();
    }
  }
  return '三个独立变体均验证：无签名 payload 篡改明确失败且不重写/清空索引；恢复后实际工具可读；取消/交付后合法旧签名回放仍被可信事实拒绝，无新增成功 stage、候选或版本，最新正确文件已恢复。';
}

/** 以公开模型 API 调整本轮刚创建的受控模型，绝不写既有模型或默认模型配置。 */
async function setControlledContext({ context, h, maxContext }) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
  const { ObjectId } = createRequire(path.join(root, 'packages/service/package.json'))(
    'mongoose'
  ).mongo;
  const query = { _id: new ObjectId(h.modelId), scope: 'system', testMode: true };
  const model = await (await h.c.database()).collection('ai_models').findOne(query);
  assert.ok(
    model?.name.startsWith('FG-TEST-') && model.name.includes(context.run),
    '只允许调整当前 harness 本轮新模型'
  );
  const url = new URL(model.requestUrl);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/v1/chat/completions');
  assert.ok(model.requestAuth);
  context.secrets.add(model.requestAuth);
  const modelData = Object.fromEntries(
    [
      'type',
      'provider',
      'model',
      'name',
      'scope',
      'isActive',
      'testMode',
      'requestUrl',
      'requestAuth',
      'pricing'
    ]
      .filter((key) => model[key] !== undefined)
      .map((key) => [key, model[key]])
  );
  modelData.config = { ...model.config, maxContext };
  success(
    await h.http({
      method: 'PUT',
      route: '/api/core/ai/model/update',
      body: { channelType: 'system', modelId: h.modelId, modelData }
    })
  );
  const stored = await (await h.c.database())
    .collection('ai_models')
    .findOne(query, { projection: { name: 1, scope: 1, testMode: 1, config: 1 } });
  assert.equal(stored.config.maxContext, maxContext);
  await h.record('仅调整本轮受控模型上下文', {
    query,
    oldMaxContext: model.config.maxContext,
    stored
  });
}

/** 对 JSON 对象键排序再算哈希，避免无语义的属性排列掩盖或制造模板变化。 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => [key, canonical(item)])
  );
}

function contentText(content) {
  return typeof content === 'string'
    ? content
    : (content ?? []).map((part) => part.text ?? '').join('');
}

/**
 * 只包装 C3 自己的 harness 实例，保留 createProgram 的真实工具回执断言。
 * 压缩调用由实际 system prompt 识别；返回的受控摘要禁止自行注入 task_index。
 */
function traceCompression({ h, state }) {
  const originalChat = h.chat;
  const trace = { normal: [], compression: [] };
  h.chat = (params) => {
    const delegated = params.nextProgram;
    return originalChat({
      ...params,
      nextProgram: {
        async respond(body) {
          const instructions = body.messages.filter((message) =>
            ['system', 'developer'].includes(message.role)
          );
          const systemText = instructions.map((message) => contentText(message.content)).join('\n');
          if (systemText.includes('你是 Agent 历史上下文 checkpoint 压缩专家')) {
            assert.ok(state.tasks, '准备 A/B 草稿之前不应出现压缩调用');
            assert.ok(!body.tools?.length, '本分支只接受真实请求历史压缩，不能混用模型工具调用');
            const requestText = body.messages
              .map((message) => contentText(message.content))
              .join('\n');
            for (const task of state.tasks) {
              assert.ok(requestText.includes(task.taskId), '真实压缩输入缺少任务 ID');
              assert.ok(requestText.includes(task.text), '真实压缩输入缺少任务业务值');
            }
            assert.ok(
              requestText.includes(state.fillerMarker),
              '没有观察到本轮实际追加的超阈值上下文'
            );
            const summary = [
              '<context_checkpoint>',
              '# Context Checkpoint',
              '## User Goal',
              '- 保留 A/B 未完成任务，下一轮只恢复并交付 A。',
              '## Current Task',
              ...state.tasks.map(
                (task) =>
                  '- taskId=' + task.taskId + '；Reply.text=' + task.text + '；已暂存，未交付。'
              ),
              '## Important Constraints',
              '- 不修改当前画布，不取消或交付 B。',
              '## Decisions Made',
              '- A 已经真实预览确认，B 是独立直接任务。',
              '## Facts / Data To Preserve',
              '- 当前任务是 B；A/B 草稿分别保留。',
              '## Entity / Value / Relation Ledger',
              ...state.tasks.map((task) => '- ' + task.taskId + ' -> ' + task.path),
              '## Exact Keys / Labels / Names To Preserve',
              '- taskId, request.md, task.json, workflow_cli_query, workflow_cli_commit, draftRevision',
              '## Tool Results Worth Remembering',
              '- stage 已实际成功，均已通过正常停止入口结束生成。',
              '## Files / Resources Mentioned',
              ...state.tasks.map(
                (task) =>
                  '- ' + task.path + '/request.md' + (task.planFile ? '；' + task.planFile : '')
              ),
              '## Open Questions',
              '- 无。',
              '## Next Steps',
              '- 从服务端 checkpoint 索引按需读取 A 的完整需求/方案，然后显式继续 A。',
              '</context_checkpoint>'
            ].join('\n');
            assert.ok(
              !summary.includes('workflow_builder_task_index'),
              '索引只能由真实服务端压缩逻辑加入'
            );
            const evidence = {
              sequence: trace.compression.length + 1,
              inputChars: requestText.length,
              inputSha256: digest(requestText),
              model: body.model,
              summary
            };
            trace.compression.push(evidence);
            await h.record('真实压缩上游调用与受控摘要', evidence);
            return { content: summary };
          }
          const tools = [...(body.tools ?? [])].sort((a, b) => {
            const left = a.function?.name ?? '';
            const right = b.function?.name ?? '';
            return left < right ? -1 : left > right ? 1 : 0;
          });
          assert.ok(tools.length, '业务模型请求必须保留工具 schema');
          const facts = state.tasks ?? [];
          for (const task of facts)
            assert.ok(!systemText.includes(task.taskId), '任务事实被动态写入 system prompt');
          const observed = {
            sequence: trace.normal.length + 1,
            systemSha256: digest(JSON.stringify(canonical(instructions))),
            toolsSha256: digest(JSON.stringify(canonical(tools))),
            hasTaskIndex: body.messages.some((message) =>
              contentText(message.content).includes('<workflow_builder_task_index>')
            ),
            model: body.model
          };
          trace.normal.push(observed);
          await h.record('真实业务请求 system/tools 模板哈希', observed);
          return delegated.respond(body);
        },
        assertFinished: () => delegated.assertFinished()
      }
    });
  };
  return trace;
}

/** 从真实落库 checkpoint 中解析服务端索引，不接受模型摘要中自行声明的恢复路径。 */
function checkpointIndex(checkpoint) {
  const match = checkpoint.match(
    /<workflow_builder_task_index>\s*([^]*?)\s*<\/workflow_builder_task_index>/
  );
  assert.ok(match, '真实 checkpoint 缺少服务端 task_index');
  const line = match[1].split('\n').find((line) => line.trim().startsWith('{'));
  assert.ok(line, 'task_index 缺少实际 JSON 快照');
  const index = JSON.parse(line);
  assert.equal(index.directory, 'task-memory');
  assert.ok(index.tasks.length > 0 && index.tasks.length <= 5);
  return index;
}

/** C3：真实超阈值压缩后，新 HTTP/runtime 使用真实索引文件读回 A，再继续校验交付。 */
export async function checkpointRecovery(context) {
  const h = await createBuilderHarness(context);
  const state = {};
  const trace = traceCompression({ h, state });
  const app = await h.createApp('memory-C3');
  const textA = marker('compressed-A');
  const textB = marker('compressed-B');
  const originalMarker = marker('complete-original');
  const original = [
    originalMarker,
    '独立任务 A，只把 Reply.text 改为 ' + textA + '，请先展示方案等待我确认。',
    '全部原始要求必须存入任务文件，不能用二百字摘要替代。'.repeat(160),
    marker('original-tail')
  ].join('\n');
  const planPayload = {
    task: { mode: 'new' },
    title: 'FG-TEST 压缩后恢复 A',
    summary: '只将指定回复改为 ' + textA + '，其他结构和配置保持。',
    mermaid: 'flowchart TD\n  Start[输入] --> Reply[指定回复]',
    sections: [
      {
        title: '完整方案',
        content:
          '目标回复：' +
          textA +
          '\n' +
          '保持开始节点、回复节点、连线、应用名称、简介和全部其他配置。'.repeat(24)
      }
    ]
  };
  const preview = await h.chat({
    app,
    modelId: h.modelId,
    content: original,
    nextProgram: createProgram({
      steps: [{ name: 'workflow_builder_present_preview', args: planPayload }],
      stopAtEnd: true
    })
  });
  const aTask = taskState(preview.snapshot).task;
  assert.equal(aTask.schemaVersion, 1);
  assert.ok(aTask.preview);
  const a = await stageAndStop({
    h,
    app,
    content: [{ type: 'select', select: { type: 'workflowBuilderPreview', action: 'confirm' } }],
    text: textA,
    task: { mode: 'continue', taskId: aTask.taskId }
  });
  assert.equal(a.task.taskId, aTask.taskId);
  assert.ok(
    humanValue(a).some(
      (value) =>
        value.select?.type === 'workflowBuilderPreview' && value.select.action === 'confirm'
    )
  );
  const b = await stageAndStop({
    h,
    app,
    content:
      '这是独立新任务 B：直接将 Reply.text 改为 ' + textB + '；先暂存并正常停止，不能接着执行 A。',
    text: textB,
    task: { mode: 'new' }
  });
  assert.notEqual(a.task.taskId, b.task.taskId);
  const aFiles = await taskFiles({ h, app, taskId: a.task.taskId });
  const bFiles = await taskFiles({ h, app, taskId: b.task.taskId });
  assert.ok(aFiles.plan);
  assert.deepEqual(JSON.parse(aFiles.plan.content), planPayload);
  assert.deepEqual(JSON.parse(aFiles.request.content), humanValue(preview));
  assert.ok(aFiles.request.content.includes(originalMarker));
  const aDraft = await draftFiles({ h, app, files: aFiles, expectedText: textA });
  const bDraft = await draftFiles({ h, app, files: bFiles, expectedText: textB });
  state.tasks = [
    {
      taskId: a.task.taskId,
      text: textA,
      path: aFiles.entry.path,
      planFile: aFiles.entry.planFile
    },
    { taskId: b.task.taskId, text: textB, path: bFiles.entry.path }
  ];
  state.fillerMarker = marker('actual-compression-input');
  await setControlledContext({ context, h, maxContext: 131072 });
  const filler = Array.from(
    { length: 6000 },
    (_, index) =>
      '上下文填充行' + index + '：甲乙丙丁戊己庚辛壬癸；保持原始需求和方案，禁止本轮执行任务。'
  ).join('\n');
  const finalText = marker('checkpoint-created');
  const compressed = await h.chat({
    app,
    modelId: h.modelId,
    content:
      '本轮只整理上下文暂不搭建，保留 A/B 草稿和任务文件。' + state.fillerMarker + '\n' + filler,
    nextProgram: createProgram({ steps: [answerOnlyStep()], finalText })
  });
  assert.ok(compressed.result.text.includes(finalText));
  assert.ok(trace.compression.length > 0, '未观察到真实请求上下文压缩调用');
  assert.deepEqual(candidateCards(compressed.snapshot), []);
  const checkpoints = compressed.snapshot.items.flatMap((item) =>
    item.obj !== 'AI'
      ? []
      : item.value
          .filter((value) => !value.displayOnly && typeof value.contextCheckpoint === 'string')
          .map((value) => ({ dataId: item.dataId, checkpoint: value.contextCheckpoint }))
  );
  const checkpoint = checkpoints.findLast(
    (entry) => entry.dataId === compressed.responseChatItemId
  );
  assert.ok(checkpoint, '本轮真实压缩结果没有持久化到 AI ChatItem');
  assert.ok(checkpoint.checkpoint.includes('Context Checkpoint'));
  const index = checkpointIndex(checkpoint.checkpoint);
  assert.equal(index.currentTaskId, b.task.taskId, 'task_index 必须是实际压缩时的当前任务快照');
  assert.deepEqual(
    index.tasks.map((task) => task.taskId).sort(),
    [a.task.taskId, b.task.taskId].sort()
  );
  const indexedA = index.tasks.find((task) => task.taskId === a.task.taskId);
  assert.equal(indexedA.path, aFiles.entry.path);
  assert.equal(indexedA.planFile, aFiles.entry.planFile);
  assert.ok(!checkpoint.checkpoint.includes(original), 'checkpoint 不应完整复制原始需求');
  assert.ok(
    !checkpoint.checkpoint.includes(planPayload.sections[0].content),
    'checkpoint 不应完整复制方案正文'
  );
  assert.ok(
    trace.normal.some((request) => request.hasTaskIndex),
    '压缩后的真实模型请求未携带 task_index'
  );
  await h.record('本轮真实 Mongo checkpoint 与服务端任务索引', {
    checkpoint,
    index,
    aManifestSha256: aDraft.manifest.sha256,
    bManifestSha256: bDraft.manifest.sha256
  });

  const delivery = deliveryProgram({
    taskId: a.task.taskId,
    expectedText: textA,
    forbiddenText: textB,
    leadingSteps: [
      readFileStep(indexedA.path + '/request.md', aFiles.request),
      readFileStep(indexedA.planFile, aFiles.plan)
    ]
  });
  const recovered = await h.chat({
    app,
    modelId: h.modelId,
    content:
      '新请求明确继续 A，taskId=' +
      a.task.taskId +
      '。先从 checkpoint 指向的真实路径读取完整原文和方案，再复用 A 的草稿校验交付。不要执行 B。',
    nextProgram: delivery.program
  });
  const version = await assertDelivery({
    h,
    app,
    round: recovered,
    taskId: a.task.taskId,
    expectedText: textA,
    finalText: delivery.finalText
  });
  assert.deepEqual(taskState(recovered.snapshot, b.task.taskId).task, b.task);
  const bAfter = await taskFiles({ h, app, taskId: b.task.taskId });
  assert.equal(bAfter.state.sha256, bFiles.state.sha256);
  assert.equal(bAfter.request.sha256, bFiles.request.sha256);
  const bDraftAfter = await draftFiles({ h, app, files: bAfter, expectedText: textB });
  assert.equal(bDraftAfter.manifest.sha256, bDraft.manifest.sha256);
  assert.equal(bDraftAfter.chunk.sha256, bDraft.chunk.sha256);
  const aAfter = await taskFiles({ h, app, taskId: a.task.taskId });
  assert.equal(aAfter.request.sha256, aFiles.request.sha256);
  assert.equal(aAfter.plan.sha256, aFiles.plan.sha256);
  assert.equal(
    new Set(trace.normal.map((request) => request.systemSha256)).size,
    1,
    '跨任务及压缩恢复时 system prompt 发生变化'
  );
  assert.equal(
    new Set(trace.normal.map((request) => request.toolsSha256)).size,
    1,
    '跨任务及压缩恢复时工具 schema 发生变化'
  );
  await h.record('C3 完整恢复交付与模板稳定性', {
    compressionCalls: trace.compression.length,
    requests: trace.normal,
    taskA: a.task.taskId,
    taskB: b.task.taskId,
    checkpointResponseId: checkpoint.dataId,
    recoveryResponseId: recovered.responseChatItemId,
    actualRecoveryToolResults: delivery.program.results,
    version
  });
  return '实际超阈值请求触发真实压缩，上游调用和 Mongo checkpoint 同时存在；服务端 task_index 保留 A/B 实际目录；新请求真实读取 A 完整原文/方案并复用原草稿交付，system/tools 哈希稳定，B 状态与分片字节及 W0 不变。';
}

export const handlers = {
  C1: requestPersistence,
  C2: taskIsolation,
  C3: checkpointRecovery,
  C4: signatureAndReplay
};

async function main() {
  if (process.argv.includes('--describe')) {
    console.log(
      JSON.stringify(
        {
          caseId,
          capabilities,
          fixture:
            '沿用 workflow-builder.integration.mjs 的显式 fixture/secrets 与 FASTGPT_TEST_REPORT；各选中项须先为 running。'
        },
        null,
        2
      )
    );
    return;
  }
  await runNodeCase(caseId, handlers);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('Workflow Builder memory integration entry failed: ' + error.name);
    process.exitCode = 1;
  });
}
