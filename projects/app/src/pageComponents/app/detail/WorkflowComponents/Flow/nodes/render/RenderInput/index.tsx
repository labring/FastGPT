import React, { useMemo } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { Box } from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';

import InputLabel from './Label';
import type { RenderInputProps } from './type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import InputRender from '@/components/InputRender';
import { formatInputType, formatRenderProps } from '@/components/InputRender/utils';
import VariableTip from '@/components/common/Textarea/MyTextarea/VariableTip';
import { useCreation } from 'ahooks';
import { useCallback } from 'react';
import { getEditorVariables } from '../../../../utils';
import { WorkflowNodeEdgeContext } from '../../../../context/workflowInitContext';
import { useTranslation } from 'next-i18next';
import { AppContext } from '@/pageComponents/app/detail/context';

const CommonInputRender = ({ inputs, item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { feConfigs } = useSystemStore();

  const editorVariables = useCreation(() => {
    return getEditorVariables({
      nodeId,
      nodeList,
      edges,
      appDetail,
      t
    });
  }, [nodeId, nodeList, edges, appDetail, t]);

  const externalVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  const handleChange = useCallback(
    (value: any) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: { ...item, value }
      });
    },
    [item, nodeId, onChangeNode]
  );

  const renderType = item.renderTypeList?.[item.selectedTypeIndex || 0];
  const inputType = formatInputType({ inputType: renderType, valueType: item.valueType });

  const props = formatRenderProps({
    inputType,
    value: item.value,
    onChange: handleChange,
    placeholder: item.placeholder,

    maxLength: item.maxLength,
    variables: [...(editorVariables || []), ...(externalVariables || [])],
    variableLabels: editorVariables,

    min: item.min,
    max: item.max,

    list: item.list
  });

  return <InputRender {...props} />;
};

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
  [FlowNodeInputTypeEnum.selectApp]: {
    Component: dynamic(() => import('./templates/SelectApp'))
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
  [FlowNodeInputTypeEnum.settingDatasetQuotePrompt]: {
    Component: dynamic(() => import('./templates/SettingQuotePrompt'))
  },

  [FlowNodeInputTypeEnum.input]: {
    Component: CommonInputRender
  },
  [FlowNodeInputTypeEnum.textarea]: {
    Component: CommonInputRender,
    LableRightComponent: dynamic(() =>
      Promise.resolve(() => <VariableTip transform={'translateY(2px)'} />)
    )
  },
  [FlowNodeInputTypeEnum.numberInput]: {
    Component: CommonInputRender
  },
  [FlowNodeInputTypeEnum.switch]: {
    Component: CommonInputRender
  },
  [FlowNodeInputTypeEnum.select]: {
    Component: CommonInputRender
  },
  [FlowNodeInputTypeEnum.multipleSelect]: {
    Component: CommonInputRender
  },
  [FlowNodeInputTypeEnum.JSONEditor]: {
    Component: CommonInputRender
  },
  [FlowNodeInputTypeEnum.selectLLMModel]: {
    Component: CommonInputRender
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
