import { describe, expect, it } from 'vitest';
import {
  appData2FlowNodeIO,
  chatConfigToSystemConfigNode,
  filterSystemConfigNodes,
  getAppChatConfig,
  getGuideModule,
  mergeSystemConfigNodeToChatConfig,
  splitGuideModule
} from '@fastgpt/global/core/workflow/utils';
import {
  NodeInputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { AppChatConfigType, VariableItemType } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const legacyQuickRepliesWelcomeText = [
  '### Welcome',
  '',
  '```quick-replies',
  'legacy question 1',
  'legacy question 2',
  '```'
].join('\n');

const variable: VariableItemType = {
  key: 'customerName',
  label: 'Customer name',
  type: VariableInputEnum.input,
  description: 'Customer name used by workflow',
  required: true,
  valueType: WorkflowIOValueTypeEnum.string,
  defaultValue: 'Ada'
};

const fullChatConfig: AppChatConfigType = {
  welcomeConfig: {
    welcomeText: legacyQuickRepliesWelcomeText,
    welcomeQuestions: ['new preset 1', 'new preset 2']
  },
  variables: [variable],
  fileSelectConfig: {
    canSelectFile: true,
    canSelectImg: false,
    maxFiles: 2,
    customFileExtensionList: ['.md']
  },
  ttsConfig: {
    type: 'web'
  },
  whisperConfig: {
    open: true,
    autoSend: true,
    autoTTSResponse: false
  },
  questionGuide: {
    open: true,
    model: 'gpt-5',
    customPrompt: 'Suggest the next useful question.'
  },
  chatInputGuide: {
    open: true,
    customUrl: 'https://example.com/input-guide'
  },
  autoExecute: {
    open: true,
    defaultPrompt: 'Run the default workflow'
  },
  scheduledTriggerConfig: {
    cronString: '0 9 * * *',
    timezone: 'Asia/Shanghai',
    defaultPrompt: 'Run scheduled workflow'
  },
  instruction: 'Use the required customerName variable.'
};

const createSystemConfigNode = (chatConfig: AppChatConfigType): StoreNodeItemType =>
  chatConfigToSystemConfigNode({
    chatConfig,
    name: 'Legacy System Config'
  });

describe('system config acceptance contracts', () => {
  it('SC-02 keeps legacy quick replies in markdown welcome text and stores new preset questions separately', () => {
    const legacySystemConfigNode = createSystemConfigNode({
      welcomeConfig: {
        welcomeText: legacyQuickRepliesWelcomeText
      }
    });

    const merged = mergeSystemConfigNodeToChatConfig({
      chatConfig: {
        welcomeConfig: {
          welcomeQuestions: ['new preset 1', 'new preset 2']
        }
      },
      systemConfigNode: legacySystemConfigNode
    });

    expect(merged.welcomeConfig?.welcomeText).toBe(legacyQuickRepliesWelcomeText);
    expect(merged.welcomeText).toBe(legacyQuickRepliesWelcomeText);
    expect(merged.welcomeConfig?.welcomeQuestions).toEqual(['new preset 1', 'new preset 2']);
    expect(merged.welcomeConfig?.welcomeQuestions).not.toContain('legacy question 1');
    expect(merged.welcomeConfig?.welcomeQuestions).not.toContain('legacy question 2');
  });

  it('SC-03 exposes saved system config values to runtime chat config and workflow IO', () => {
    const runtimeConfig = getAppChatConfig({
      chatConfig: fullChatConfig,
      isPublicFetch: true
    });
    const io = appData2FlowNodeIO({
      chatConfig: runtimeConfig
    });

    expect(runtimeConfig.variables).toEqual([variable]);
    expect(runtimeConfig.fileSelectConfig).toEqual(fullChatConfig.fileSelectConfig);
    expect(runtimeConfig.ttsConfig).toEqual(fullChatConfig.ttsConfig);
    expect(runtimeConfig.whisperConfig).toEqual(fullChatConfig.whisperConfig);
    expect(runtimeConfig.questionGuide).toEqual(fullChatConfig.questionGuide);
    expect(runtimeConfig.chatInputGuide).toEqual(fullChatConfig.chatInputGuide);
    expect(runtimeConfig.autoExecute).toEqual(fullChatConfig.autoExecute);
    expect(runtimeConfig.scheduledTriggerConfig).toEqual(fullChatConfig.scheduledTriggerConfig);
    expect(io.inputs.some((input) => input.key === NodeInputKeyEnum.fileUrlList)).toBe(true);
    expect(io.inputs.some((input) => input.key === variable.key)).toBe(true);
  });

  it('SC-04 migrates old system config node data and removes the old node from saved workflow nodes', () => {
    const systemConfigNode = createSystemConfigNode(fullChatConfig);
    const workflowStartNode: StoreNodeItemType = {
      nodeId: 'workflowStart',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      name: 'Workflow start',
      inputs: [],
      outputs: []
    };

    const nodes = [systemConfigNode, workflowStartNode];
    const migratedChatConfig = mergeSystemConfigNodeToChatConfig({
      chatConfig: {},
      systemConfigNode: getGuideModule(nodes)
    });
    const savedNodes = filterSystemConfigNodes(nodes);

    expect(migratedChatConfig.welcomeConfig?.welcomeText).toBe(legacyQuickRepliesWelcomeText);
    expect(migratedChatConfig.welcomeConfig?.welcomeQuestions).toEqual([
      'new preset 1',
      'new preset 2'
    ]);
    expect(migratedChatConfig.variables).toEqual([variable]);
    expect(savedNodes).toEqual([workflowStartNode]);
    expect(getGuideModule(savedNodes)).toBeUndefined();
  });

  it('SC-05/SC-08 applies the same legacy migration contract for workflow, agent, and agent v2 imports', () => {
    const systemConfigNode = createSystemConfigNode(fullChatConfig);
    const appKinds = ['workflow', 'agent', 'agentV2'] as const;

    appKinds.forEach(() => {
      const migrated = mergeSystemConfigNodeToChatConfig({
        chatConfig: {},
        systemConfigNode
      });
      const savedNodes = filterSystemConfigNodes([systemConfigNode]);

      expect(migrated.welcomeConfig?.welcomeText).toBe(legacyQuickRepliesWelcomeText);
      expect(migrated.welcomeConfig?.welcomeQuestions).toEqual(['new preset 1', 'new preset 2']);
      expect(migrated.questionGuide).toEqual(fullChatConfig.questionGuide);
      expect(savedNodes).toEqual([]);
    });
  });

  it('SC-06/SC-07 exports a legacy node copy for reuse and re-imports without duplicating saved config', () => {
    const exportNodes = [
      {
        nodeId: 'workflowStart',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        name: 'Workflow start',
        inputs: [],
        outputs: []
      },
      createSystemConfigNode(fullChatConfig)
    ];

    const reimportedChatConfig = mergeSystemConfigNodeToChatConfig({
      chatConfig: fullChatConfig,
      systemConfigNode: getGuideModule(exportNodes)
    });
    const savedNodes = filterSystemConfigNodes(exportNodes);

    expect(savedNodes.map((node) => node.flowNodeType)).toEqual([FlowNodeTypeEnum.workflowStart]);
    expect(reimportedChatConfig.welcomeConfig?.welcomeText).toBe(legacyQuickRepliesWelcomeText);
    expect(reimportedChatConfig.welcomeConfig?.welcomeQuestions).toEqual([
      'new preset 1',
      'new preset 2'
    ]);
    expect(
      reimportedChatConfig.welcomeConfig?.welcomeQuestions?.filter(
        (text) => text === 'new preset 1'
      )
    ).toHaveLength(1);
  });

  it('SC-09 writes a legacy-readable system config node when exporting new version config', () => {
    const legacyNode = createSystemConfigNode(fullChatConfig);
    const parsedByOldRuntime = splitGuideModule(legacyNode);

    expect(legacyNode.flowNodeType).toBe(FlowNodeTypeEnum.systemConfig);
    expect(
      legacyNode.inputs.every((input) =>
        input.renderTypeList.includes(FlowNodeInputTypeEnum.hidden)
      )
    ).toBe(true);
    expect(parsedByOldRuntime.welcomeText).toBe(legacyQuickRepliesWelcomeText);
    expect(parsedByOldRuntime.welcomeQuestions).toEqual(['new preset 1', 'new preset 2']);
    expect(parsedByOldRuntime.variables).toEqual([variable]);
    expect(parsedByOldRuntime.autoExecute).toEqual(fullChatConfig.autoExecute);
    expect(parsedByOldRuntime.scheduledTriggerConfig).toEqual(
      fullChatConfig.scheduledTriggerConfig
    );
  });
});
