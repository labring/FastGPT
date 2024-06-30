import React, { useMemo } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { Box } from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import dynamic from 'next/dynamic';

import InputLabel from './Label';
import type { RenderInputProps } from './type';

const RenderList: {
  types: FlowNodeInputTypeEnum[];
  Component: React.ComponentType<RenderInputProps>;
}[] = [
  {
    types: [FlowNodeInputTypeEnum.reference],
    Component: dynamic(() => import('./templates/Reference'))
  },
  {
    types: [FlowNodeInputTypeEnum.input],
    Component: dynamic(() => import('./templates/TextInput'))
  },
  {
    types: [FlowNodeInputTypeEnum.numberInput],
    Component: dynamic(() => import('./templates/NumberInput'))
  },
  {
    types: [FlowNodeInputTypeEnum.switch],
    Component: dynamic(() => import('./templates/Switch'))
  },
  {
    types: [FlowNodeInputTypeEnum.textarea],
    Component: dynamic(() => import('./templates/Textarea'))
  },
  {
    types: [FlowNodeInputTypeEnum.selectApp],
    Component: dynamic(() => import('./templates/SelectApp'))
  },
  {
    types: [FlowNodeInputTypeEnum.selectLLMModel],
    Component: dynamic(() => import('./templates/SelectLLMModel'))
  },
  {
    types: [FlowNodeInputTypeEnum.settingLLMModel],
    Component: dynamic(() => import('./templates/SettingLLMModel'))
  },
  {
    types: [FlowNodeInputTypeEnum.selectDataset],
    Component: dynamic(() => import('./templates/SelectDataset'))
  },
  {
    types: [FlowNodeInputTypeEnum.selectDatasetParamsModal],
    Component: dynamic(() => import('./templates/SelectDatasetParams'))
  },
  {
    types: [FlowNodeInputTypeEnum.addInputParam],
    Component: dynamic(() => import('./templates/AddInputParam'))
  },
  {
    types: [FlowNodeInputTypeEnum.JSONEditor],
    Component: dynamic(() => import('./templates/JsonEditor'))
  },
  {
    types: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
    Component: dynamic(() => import('./templates/SettingQuotePrompt'))
  }
];

const hideLabelTypeList = [FlowNodeInputTypeEnum.addInputParam];

type Props = {
  flowInputList: FlowNodeInputItemType[];
  nodeId: string;
  CustomComponent?: Record<string, (e: FlowNodeInputItemType) => React.ReactNode>;
  mb?: number;
};
const RenderInput = ({ flowInputList, nodeId, CustomComponent, mb = 5 }: Props) => {
  const copyInputs = useMemo(() => JSON.stringify(flowInputList), [flowInputList]);
  const filterInputs = useMemo(() => {
    const parseSortInputs = JSON.parse(copyInputs) as FlowNodeInputItemType[];
    return parseSortInputs.filter((input) => {
      return true;
    });
  }, [copyInputs]);

  const memoCustomComponent = useMemo(() => CustomComponent || {}, [CustomComponent]);

  const Render = useMemo(() => {
    return filterInputs.map((input) => {
      const renderType = input.renderTypeList?.[input.selectedTypeIndex || 0];
      const RenderComponent = (() => {
        if (renderType === FlowNodeInputTypeEnum.custom && memoCustomComponent[input.key]) {
          return <>{memoCustomComponent[input.key]({ ...input })}</>;
        }

        const Component = RenderList.find((item) => item.types.includes(renderType))?.Component;

        if (!Component) return null;
        return <Component inputs={filterInputs} item={input} nodeId={nodeId} />;
      })();

      return renderType !== FlowNodeInputTypeEnum.hidden ? (
        <Box key={input.key} _notLast={{ mb }} position={'relative'}>
          {!!input.label && !hideLabelTypeList.includes(renderType) && (
            <InputLabel nodeId={nodeId} input={input} />
          )}
          {!!RenderComponent && (
            <Box mt={2} className={'nodrag'}>
              {RenderComponent}
            </Box>
          )}
        </Box>
      ) : null;
    });
  }, [filterInputs, mb, memoCustomComponent, nodeId]);

  return <>{Render}</>;
};

export default React.memo(RenderInput);
