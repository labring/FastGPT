import { vi, it, expect } from 'vitest';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { storeNode2FlowNode } from '@/web/core/workflow/utils';
import type { TFunction } from 'next-i18next';

vi.mock('@fastgpt/global/core/workflow/template/constants', () => ({
  moduleTemplatesFlat: [
    {
      flowNodeType: 'textEditor',
      name: 'Text editor',
      avatar: 'template-avatar.png',
      intro: '',
      version: '2.0',
      inputs: [],
      outputs: []
    }
  ]
}));

const t = ((key: string) => key) as TFunction;

it.each([{}, { version: '1.0' }, { version: '3.0', avatar: 'store-avatar.png' }])(
  'uses the template version and avatar for a stored node with %j',
  (metadata) => {
    const item: StoreNodeItemType = {
      nodeId: 'text',
      flowNodeType: FlowNodeTypeEnum.textEditor,
      name: 'Stored text editor',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      ...metadata
    };

    const { data } = storeNode2FlowNode({ item, t });

    expect(data).toMatchObject({ version: '2.0', avatar: 'template-avatar.png' });
  }
);
