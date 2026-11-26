import { expect, test, type Page } from '@playwright/test';
import { AiChatModule } from '../../../../../packages/global/core/workflow/template/system/aiChat';
import { DatasetSearchModule } from '../../../../../packages/global/core/workflow/template/system/datasetSearch';
import { userFilesInput } from '../../../../../packages/global/core/workflow/template/output';
import { FlowNodeInputTypeEnum } from '../../../../../packages/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum
} from '../../../../../packages/global/core/workflow/constants';
import {
  buildWorkflowGraph,
  withWorkflowApp,
  workflowEditor,
  type Graph
} from './workflow.browser';

const manualRef = ['Manual', NodeOutputKeyEnum.text];
const fileRef = ['Start', NodeOutputKeyEnum.userFiles];
const questionRef = ['Start', NodeOutputKeyEnum.userChatInput];

/** 保留真实节点模板和端口，只有输入初态区分手动引用和待自动填充的空白。 */
function uploadGraph(existingOutput: boolean) {
  const graph = buildWorkflowGraph(
    ['Start', 'Manual', 'Chat', 'Search'],
    [
      ['Start', 'Manual'],
      ['Manual', 'Chat'],
      ['Chat', 'Search']
    ]
  );
  if (existingOutput) graph.nodes[0].outputs.push(userFilesInput);
  for (const [index, template] of [
    [2, AiChatModule],
    [3, DatasetSearchModule]
  ] as const) {
    const { nodeId, name, position } = graph.nodes[index];
    graph.nodes[index] = {
      ...template,
      nodeId,
      name,
      position,
      inputs: template.inputs.map((input) =>
        input.key === NodeInputKeyEnum.userChatInput
          ? { ...input, selectedType: FlowNodeInputTypeEnum.reference, value: manualRef }
          : input
      )
    };
  }
  return graph;
}

async function setImageUpload(page: Page, enabled: boolean) {
  const title = page.getByText('系统配置', { exact: true });
  if (!(await title.isVisible())) {
    await page.getByRole('button', { name: '系统配置', exact: true }).click();
  }
  const row = page.getByText('文件上传', { exact: true }).locator('..');
  await row.getByRole('button', { name: enabled ? '关闭' : '开启', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: '支持上传的类型' });
  const image = dialog.getByRole('checkbox', { name: /^图片/ });
  await dialog.getByText('图片', { exact: true }).click();
  if (enabled) await expect(image).toBeChecked();
  else await expect(image).not.toBeChecked();
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await expect(dialog).toBeHidden();
  await title.locator('..').getByRole('button', { name: '关闭', exact: true }).click();
}

function references(graph: Graph) {
  const input = (id: string, key: string) =>
    graph.nodes.find((node) => node.nodeId === id)?.inputs.find((item) => item.key === key)?.value;
  return {
    enabled: graph.chatConfig.fileSelectConfig?.canSelectImg ?? false,
    fileOutputs: graph.nodes
      .find((node) => node.nodeId === 'Start')
      ?.outputs.filter((out) => out.id === NodeOutputKeyEnum.userFiles).length,
    files: input('Chat', NodeInputKeyEnum.fileUrlList),
    question: input('Chat', NodeInputKeyEnum.userChatInput),
    search: input('Search', NodeInputKeyEnum.datasetSearchInput)
  };
}

for (const existingOutput of [false, true]) {
  const item = existingOutput ? 'C2' : 'C1';
  test(`[FG-APP-WORKFLOW-075/${item}] 图片开关与撤销同步更新下游引用`, async ({
    page
  }, testInfo) => {
    await withWorkflowApp({
      page,
      testInfo,
      graph: uploadGraph(existingOutput),
      run: async () => {
        const editor = workflowEditor(page, testInfo);
        const before = await editor.exportGraph();
        await setImageUpload(page, true);
        const enabled = await editor.exportGraph();
        await setImageUpload(page, false);
        const disabled = await editor.exportGraph();
        await page
          .locator('button')
          .filter({ has: page.locator('svg[data-fastgpt-icon-scoped$="-core/workflow/undo"]') })
          .click();
        const restored = await editor.exportGraph();
        await testInfo.attach('upload-config-and-references', {
          body: JSON.stringify(
            [before, enabled, disabled, restored].map((graph) => ({
              ...references(graph),
              edges: editor.tupleSet(graph)
            }))
          ),
          contentType: 'application/json'
        });

        expect(references(before)).toEqual(
          expect.objectContaining({
            enabled: false,
            fileOutputs: existingOutput ? 1 : 0,
            files: undefined
          })
        );
        expect(references(enabled)).toEqual({
          enabled: true,
          fileOutputs: 1,
          files: [fileRef],
          question: manualRef,
          search: [questionRef, fileRef]
        });
        expect(references(disabled)).toEqual({
          enabled: false,
          fileOutputs: 0,
          files: undefined,
          question: manualRef,
          search: [questionRef]
        });
        expect(references(restored)).toEqual(references(enabled));
        for (const graph of [before, enabled, disabled, restored]) {
          expect(references(graph).question).toEqual(manualRef);
          expect(editor.tupleSet(graph)).toEqual(editor.tupleSet(before));
          expect(graph.nodes.map((node) => node.nodeId)).toEqual(
            before.nodes.map((node) => node.nodeId)
          );
        }
      }
    });
  });
}
