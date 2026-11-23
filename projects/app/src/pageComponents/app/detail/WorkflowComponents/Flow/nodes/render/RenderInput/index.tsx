import { SandboxInputConfig } from '../../components/WorkflowSandboxConfig';
import React from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { Box, Flex } from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import dynamic from 'next/dynamic';
import InputLabel from './Label';
import type { RenderInputProps } from './type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import VariableTip from '@/components/common/Textarea/MyTextarea/VariableTip';
import CommonInputForm from './templates/CommonInputForm';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import { isDatasetTagFilterOpen } from '@fastgpt/global/core/dataset/search/tagFilter';
import { datasetSearchUsesLegacyFilter } from '@/web/core/workflow/datasetSearchNodeUpgrade';

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
    Component: dynamic(() => import('./templates/FileSelect'))
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
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.textarea]: {
    Component: CommonInputForm,
    LableRightComponent: dynamic(() =>
      Promise.resolve(() => <VariableTip transform={'translateY(2px)'} />)
    )
  },
  [FlowNodeInputTypeEnum.numberInput]: {
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.switch]: {
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.select]: {
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.multipleSelect]: {
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.JSONEditor]: {
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.selectLLMModel]: {
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.timePointSelect]: {
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.timeRangeSelect]: {
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.password]: {
    Component: CommonInputForm
  },
  [FlowNodeInputTypeEnum.datasetTagFilter]: {
    Component: dynamic(() => import('./templates/DatasetTagFilter')),
    LableRightComponent: dynamic(() =>
      import('./templates/DatasetTagFilter').then((mod) => mod.DatasetTagFilterLogic)
    )
  },

  [FlowNodeInputTypeEnum.agentGenerated]: undefined,
  [FlowNodeInputTypeEnum.customVariable]: undefined,
  [FlowNodeInputTypeEnum.hidden]: undefined,
  [FlowNodeInputTypeEnum.off]: undefined,
  [FlowNodeInputTypeEnum.custom]: undefined,
  [FlowNodeInputTypeEnum.selectSkill]: {
    Component: dynamic(() =>
      import('../../NodeAgent/AgentInputs').then((mod) => mod.AgentSkillsInput)
    ),
    LableRightComponent: dynamic(() =>
      import('../../NodeAgent/AgentInputs').then((mod) => mod.AgentSkillsLabel)
    )
  },
  [FlowNodeInputTypeEnum.selectTool]: {
    Component: dynamic(() =>
      import('../../NodeAgent/AgentInputs').then((mod) => mod.AgentToolsInput)
    )
  }
};

const hideLabelTypeList = [FlowNodeInputTypeEnum.addInputParam];

type Props = {
  flowInputList: FlowNodeInputItemType[];
  nodeId: string;
  CustomComponent?: Record<string, (e: FlowNodeInputItemType) => React.ReactNode>;
  CustomLabelRightComponent?: Record<string, React.JSX.Element | undefined>;
  settingLLMModelProps?: RenderInputProps['settingLLMModelProps'];
  mb?: number;
  isTool?: boolean;
  onChangeSandbox?: (checked: boolean) => void;
};
const AgentGeneratedPlaceholder = ({ isRowUI }: { isRowUI: boolean }) => {
  const { t } = useTranslation();

  if (isRowUI) {
    return (
      <Flex alignItems={'center'} gap={1} color={'myGray.500'} fontSize={'mini'}>
        <MyIcon name={'infoRounded'} w={'14px'} color={'myGray.500'} />
        <Box>{t('common:core.workflow.inputType.agentGeneratedSwitchTip')}</Box>
      </Flex>
    );
  }

  return (
    <Flex
      h={'40px'}
      alignItems={'center'}
      px={3}
      bg={'myGray.50'}
      border={'base'}
      borderColor={'myGray.200'}
      borderRadius={'md'}
      color={'myGray.500'}
      fontSize={'sm'}
    >
      {t('common:core.workflow.inputType.agentGeneratedInputPlaceholder')}
    </Flex>
  );
};

const RenderInput = ({
  flowInputList,
  nodeId,
  CustomComponent,
  CustomLabelRightComponent,
  settingLLMModelProps,
  mb = 5,
  isTool,
  onChangeSandbox
}: Props) => {
  const { feConfigs } = useSystemStore();

  const filterProInputs = useMemoEnhance(() => {
    return flowInputList.filter((input) => {
      if (input.isPro && !feConfigs?.isPlus) return false;
      return true;
    });
  }, [feConfigs?.isPlus, flowInputList]);

  const filterInputs = useMemoEnhance(() => {
    return filterProInputs.filter((input) => {
      const renderType = getSelectedInputRenderType(input);
      const isDynamic = !!input.canEdit;

      // Agent 的过滤来源由知识库参数弹窗编辑，引用模式也不重复生成独立输入行。
      if (
        input.key === NodeInputKeyEnum.collectionFilterMatch &&
        input.renderTypeList.includes(FlowNodeInputTypeEnum.hidden)
      )
        return false;

      if (
        renderType === FlowNodeInputTypeEnum.hidden ||
        renderType === FlowNodeInputTypeEnum.off ||
        isDynamic
      )
        return false;

      return true;
    });
  }, [filterProInputs]);

  return (
    <>
      {filterInputs.map((input) => {
        const renderType = getSelectedInputRenderType(input) ?? FlowNodeInputTypeEnum.custom;
        const agentGeneratedDeveloperType =
          input.renderTypeList.find((type) => type !== FlowNodeInputTypeEnum.agentGenerated) ??
          FlowNodeInputTypeEnum.input;

        const RenderComponent = (() => {
          if (renderType === FlowNodeInputTypeEnum.agentGenerated) {
            return {
              Component: (
                <AgentGeneratedPlaceholder
                  isRowUI={agentGeneratedDeveloperType === FlowNodeInputTypeEnum.switch}
                />
              )
            };
          }

          if (renderType !== FlowNodeInputTypeEnum.reference && CustomComponent?.[input.key]) {
            return {
              Component: <>{CustomComponent?.[input.key]({ ...input })}</>,
              LableRightComponent: CustomLabelRightComponent?.[input.key]
            };
          }

          if (
            input.key === NodeInputKeyEnum.useAgentSandbox &&
            renderType !== FlowNodeInputTypeEnum.reference
          ) {
            return {
              Component: (
                <SandboxInputConfig
                  item={input}
                  inputs={filterProInputs}
                  nodeId={nodeId}
                  onChangeSandbox={onChangeSandbox}
                />
              )
            };
          }
          const RenderItem = RenderList[renderType];
          if (!RenderItem) return null;
          const renderInput = input;

          const isCollectionFilter = input.key === NodeInputKeyEnum.collectionFilterMatch;
          const isDatasetSelect = input.key === NodeInputKeyEnum.datasetSelectList;
          const isFilterOpen =
            !isCollectionFilter ||
            datasetSearchUsesLegacyFilter(filterProInputs) ||
            isDatasetTagFilterOpen(renderInput.value);
          const LableRightComponent = isCollectionFilter
            ? RenderList[FlowNodeInputTypeEnum.datasetTagFilter]?.LableRightComponent
            : isDatasetSelect
              ? RenderList[FlowNodeInputTypeEnum.selectDataset]?.LableRightComponent
              : RenderItem.LableRightComponent;

          return {
            Component: isFilterOpen ? (
              <RenderItem.Component
                inputs={filterProInputs}
                item={renderInput}
                nodeId={nodeId}
                settingLLMModelProps={settingLLMModelProps}
              />
            ) : null,
            LableRightComponent:
              CustomLabelRightComponent?.[input.key] ??
              (LableRightComponent ? (
                <LableRightComponent inputs={filterProInputs} item={renderInput} nodeId={nodeId} />
              ) : undefined)
          };
        })();

        const isRowUI =
          input.key === NodeInputKeyEnum.useAgentSandbox ||
          renderType === FlowNodeInputTypeEnum.switch ||
          (renderType === FlowNodeInputTypeEnum.agentGenerated &&
            agentGeneratedDeveloperType === FlowNodeInputTypeEnum.switch);

        return (
          <Box
            key={input.key}
            _notLast={{ mb }}
            position={'relative'}
            display={isRowUI ? 'flex' : 'block'}
            alignItems={'center'}
            justifyContent={'space-between'}
          >
            {!!input.label && !hideLabelTypeList.includes(renderType) && (
              <InputLabel
                nodeId={nodeId}
                input={input}
                RightComponent={RenderComponent?.LableRightComponent}
                isTool={isTool}
              />
            )}

            {!!RenderComponent?.Component && (
              <Box mt={isRowUI ? 0 : 2} className={'nodrag'}>
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
