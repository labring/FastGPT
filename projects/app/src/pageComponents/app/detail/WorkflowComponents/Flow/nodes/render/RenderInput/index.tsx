import React, { useMemo } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { Box } from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import dynamic from 'next/dynamic';

import InputLabel from './Label';
import type { RenderInputProps } from './type';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const RenderList: Record<
  FlowNodeInputTypeEnum,
  | {
      Component: React.ComponentType<RenderInputProps>;
      LableRightComponent?: React.ComponentType<RenderInputProps>;
    }
  | undefined
> = {
  [FlowNodeInputTypeEnum.reference]: {
    Component: dynamic(() => import('./templates/Reference'))
  },
  [FlowNodeInputTypeEnum.fileSelect]: {
    Component: dynamic(() => import('./templates/Reference'))
  },
  [FlowNodeInputTypeEnum.select]: {
    Component: dynamic(() => import('./templates/Select'))
  },
  [FlowNodeInputTypeEnum.numberInput]: {
    Component: dynamic(() => import('./templates/NumberInput'))
  },
  [FlowNodeInputTypeEnum.switch]: {
    Component: dynamic(() => import('./templates/Switch'))
  },
  [FlowNodeInputTypeEnum.selectApp]: {
    Component: dynamic(() => import('./templates/SelectApp'))
  },
  [FlowNodeInputTypeEnum.selectLLMModel]: {
    Component: dynamic(() => import('./templates/SelectLLMModel'))
  },
  [FlowNodeInputTypeEnum.settingLLMModel]: {
    Component: dynamic(() => import('./templates/SettingLLMModel'))
  },
  [FlowNodeInputTypeEnum.selectDataset]: {
    Component: dynamic(() =>
      import('./templates/SelectDataset').then((mod) => mod.SelectDatasetRender)
    ),
    LableRightComponent: dynamic(() =>
      import('./templates/SelectDataset').then((mod) => mod.SwitchAuthTmb)
    )
  },
  [FlowNodeInputTypeEnum.selectDatasetParamsModal]: {
    Component: dynamic(() => import('./templates/SelectDatasetParams'))
  },
  [FlowNodeInputTypeEnum.addInputParam]: {
    Component: dynamic(() => import('./templates/DynamicInputs/index'))
  },
  [FlowNodeInputTypeEnum.JSONEditor]: {
    Component: dynamic(() => import('./templates/JsonEditor'))
  },
  [FlowNodeInputTypeEnum.settingDatasetQuotePrompt]: {
    Component: dynamic(() => import('./templates/SettingQuotePrompt'))
  },
  [FlowNodeInputTypeEnum.input]: {
    Component: dynamic(() => import('./templates/TextInput'))
  },
  [FlowNodeInputTypeEnum.textarea]: {
    Component: dynamic(() => import('./templates/Textarea')),
    LableRightComponent: dynamic(() =>
      import('./templates/Textarea').then((mod) => mod.TextareaRightComponent)
    )
  },

  [FlowNodeInputTypeEnum.customVariable]: undefined,
  [FlowNodeInputTypeEnum.hidden]: undefined,
  [FlowNodeInputTypeEnum.custom]: undefined
};

const hideLabelTypeList = [FlowNodeInputTypeEnum.addInputParam];

type Props = {
  flowInputList: FlowNodeInputItemType[];
  nodeId: string;
  CustomComponent?: Record<string, (e: FlowNodeInputItemType) => React.ReactNode>;
  mb?: number;
};
const RenderInput = ({ flowInputList, nodeId, CustomComponent, mb = 5 }: Props) => {
  const { feConfigs } = useSystemStore();

  const filterProInputs = useMemo(() => {
    return flowInputList.filter((input) => {
      if (input.isPro && !feConfigs?.isPlus) return false;
      return true;
    });
  }, [feConfigs?.isPlus, flowInputList]);

  const filterInputs = useMemo(() => {
    return filterProInputs.filter((input) => {
      const renderType = input.renderTypeList?.[input.selectedTypeIndex || 0];
      const isDynamic = !!input.canEdit;

      if (renderType === FlowNodeInputTypeEnum.hidden || isDynamic) return false;

      return true;
    });
  }, [filterProInputs]);

  return (
    <>
      {filterInputs.map((input) => {
        const renderType = input.renderTypeList?.[input.selectedTypeIndex || 0];

        const RenderComponent = (() => {
          if (renderType === FlowNodeInputTypeEnum.custom && CustomComponent?.[input.key]) {
            return {
              Component: <>{CustomComponent?.[input.key]({ ...input })}</>
            };
          }

          const RenderItem = RenderList[renderType];

          if (!RenderItem) return null;

          return {
            Component: (
              <RenderItem.Component inputs={filterProInputs} item={input} nodeId={nodeId} />
            ),
            LableRightComponent: RenderItem.LableRightComponent ? (
              <RenderItem.LableRightComponent
                inputs={filterProInputs}
                item={input}
                nodeId={nodeId}
              />
            ) : undefined
          };
        })();

        return (
          <Box key={input.key} _notLast={{ mb }} position={'relative'}>
            {!!input.label && !hideLabelTypeList.includes(renderType) && (
              <InputLabel
                nodeId={nodeId}
                input={input}
                RightComponent={RenderComponent?.LableRightComponent}
              />
            )}
            {!!RenderComponent && (
              <Box mt={2} className={'nodrag'}>
                {RenderComponent.Component}
              </Box>
            )}
          </Box>
        );
      })}
    </>
  );
};

export default React.memo(RenderInput);
