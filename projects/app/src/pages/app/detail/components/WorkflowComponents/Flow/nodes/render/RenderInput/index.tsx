import React, { useMemo } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { Box } from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import dynamic from 'next/dynamic';

import InputLabel from './Label';
import type { RenderInputProps } from './type';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const RenderList: {
  types: FlowNodeInputTypeEnum[];
  Component: React.ComponentType<RenderInputProps>;
}[] = [
  {
    types: [FlowNodeInputTypeEnum.reference],
    Component: dynamic(() => import('./templates/Reference'))
  },
  {
    types: [FlowNodeInputTypeEnum.fileSelect],
    Component: dynamic(() => import('./templates/Reference'))
  },
  {
    types: [FlowNodeInputTypeEnum.select],
    Component: dynamic(() => import('./templates/Select'))
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
    Component: dynamic(() => import('./templates/DynamicInputs/index'))
  },
  {
    types: [FlowNodeInputTypeEnum.JSONEditor],
    Component: dynamic(() => import('./templates/JsonEditor'))
  },
  {
    types: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
    Component: dynamic(() => import('./templates/SettingQuotePrompt'))
  },
  {
    types: [FlowNodeInputTypeEnum.input],
    Component: dynamic(() => import('./templates/TextInput'))
  },
  {
    types: [FlowNodeInputTypeEnum.textarea],
    Component: dynamic(() => import('./templates/Textarea'))
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
  const { feConfigs } = useSystemStore();

  const filterInputs = useMemo(() => {
    return flowInputList.filter((input) => {
      if (input.isPro && !feConfigs?.isPlus) return false;
      return true;
    });
  }, [feConfigs?.isPlus, flowInputList]);

  return (
    <>
      {filterInputs.map((input) => {
        const renderType = input.renderTypeList?.[input.selectedTypeIndex || 0];
        const isDynamic = !!input.canEdit;

        const RenderComponent = (() => {
          if (renderType === FlowNodeInputTypeEnum.custom && CustomComponent?.[input.key]) {
            return <>{CustomComponent?.[input.key]({ ...input })}</>;
          }

          const Component = RenderList.find((item) => item.types.includes(renderType))?.Component;

          if (!Component) return null;
          return <Component inputs={filterInputs} item={input} nodeId={nodeId} />;
        })();

        return renderType !== FlowNodeInputTypeEnum.hidden && !isDynamic ? (
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
      })}
    </>
  );
};

export default React.memo(RenderInput);
