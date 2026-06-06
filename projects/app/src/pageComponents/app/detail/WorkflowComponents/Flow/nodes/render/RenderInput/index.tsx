import React from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { Box, Flex, Switch } from '@chakra-ui/react';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import dynamic from 'next/dynamic';
import InputLabel from './Label';
import type { RenderInputProps } from './type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import VariableTip from '@/components/common/Textarea/MyTextarea/VariableTip';
import CommonInputForm from './templates/CommonInputForm';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import SandboxTipTag from '@/pageComponents/app/detail/components/SandboxTipTag';
import SandboxNotSupportTip from '@/pageComponents/app/detail/components/SandboxNotSupportTip';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useTranslation } from 'next-i18next';

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

  [FlowNodeInputTypeEnum.customVariable]: undefined,
  [FlowNodeInputTypeEnum.hidden]: undefined,
  [FlowNodeInputTypeEnum.custom]: undefined,
  [FlowNodeInputTypeEnum.selectSkill]: undefined,
  [FlowNodeInputTypeEnum.selectTool]: undefined
};

const hideLabelTypeList = [FlowNodeInputTypeEnum.addInputParam];

type Props = {
  flowInputList: FlowNodeInputItemType[];
  nodeId: string;
  CustomComponent?: Record<string, (e: FlowNodeInputItemType) => React.ReactNode>;
  mb?: number;
};
const RenderInput = ({ flowInputList, nodeId, CustomComponent, mb = 5 }: Props) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const showSandbox = feConfigs.show_agent_sandbox;

  const filterProInputs = useMemoEnhance(() => {
    return flowInputList.filter((input) => {
      if (input.isPro && !feConfigs?.isPlus) return false;
      return true;
    });
  }, [feConfigs?.isPlus, flowInputList]);

  const filterInputs = useMemoEnhance(() => {
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

          const renderInput =
            input.key === NodeInputKeyEnum.useAgentSandbox
              ? {
                  ...input,
                  customRender: ({
                    value,
                    onChange
                  }: {
                    value: boolean;
                    onChange?: (value: boolean) => void;
                  }) => (
                    <Switch
                      isChecked={!!value}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (checked && (!showSandbox || !enableSandbox)) return;
                        onChange?.(checked);
                      }}
                    />
                  )
                }
              : input;

          return {
            Component: (
              <RenderItem.Component inputs={filterProInputs} item={renderInput} nodeId={nodeId} />
            ),
            LableRightComponent: RenderItem.LableRightComponent ? (
              <RenderItem.LableRightComponent
                inputs={filterProInputs}
                item={renderInput}
                nodeId={nodeId}
              />
            ) : undefined
          };
        })();

        const isRowUI = renderType === FlowNodeInputTypeEnum.switch;

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
              />
            )}

            {/* tmp */}
            {input.key === NodeInputKeyEnum.useAgentSandbox ? (
              RenderComponent ? (
                <Flex alignItems={'center'} gap={1}>
                  {showSandbox && enableSandbox ? (
                    <SandboxTipTag />
                  ) : (
                    <MyTag>
                      {t(
                        showSandbox ? 'app:sandbox_free_not_support' : 'app:sandbox_not_support_tip'
                      )}
                    </MyTag>
                  )}
                  {RenderComponent.Component}
                </Flex>
              ) : (
                <SandboxNotSupportTip type={showSandbox ? 'freeDisable' : 'systemDisable'} />
              )
            ) : (
              <>
                {!!RenderComponent && (
                  <Box mt={isRowUI ? 0 : 2} className={'nodrag'}>
                    {RenderComponent.Component}
                  </Box>
                )}
              </>
            )}
          </Box>
        );
      })}
    </>
  );
};

export default React.memo(RenderInput);
