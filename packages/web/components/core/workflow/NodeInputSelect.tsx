import React, { useMemo, useRef } from 'react';
import MyMenu from '../../common/MyMenu';
import {
  FlowNodeInputMap,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { Box, Button, useTheme } from '@chakra-ui/react';
import MyIcon from '../../common/Icon';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '../../../hooks/useConfirm';

const NodeInputSelect = ({
  renderTypeList,
  renderTypeIndex = 0,
  onChange
}: {
  renderTypeList: string[];
  renderTypeIndex?: number;
  onChange: (e: string) => void;
}) => {
  const { t } = useTranslation();
  const { openConfirm, ConfirmModal } = useConfirm({
    title: t('common:core.workflow.Change input type tip')
  });
  const renderType = renderTypeList[renderTypeIndex];
  const theme = useTheme();

  const inputList = useRef([
    {
      type: FlowNodeInputTypeEnum.reference,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.reference].icon,
      title: t('common:core.workflow.inputType.Reference')
    },
    {
      type: FlowNodeInputTypeEnum.input,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.input].icon,
      title: t('common:core.workflow.inputType.Manual input')
    },
    {
      type: FlowNodeInputTypeEnum.numberInput,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.numberInput].icon,

      title: t('common:core.workflow.inputType.Manual input')
    },
    {
      type: FlowNodeInputTypeEnum.switch,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.switch].icon,
      title: t('common:core.workflow.inputType.Manual select')
    },
    {
      type: FlowNodeInputTypeEnum.select,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.select].icon,
      title: t('common:core.workflow.inputType.Manual select')
    },
    {
      type: FlowNodeInputTypeEnum.textarea,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.textarea].icon,

      title: t('common:core.workflow.inputType.Manual input')
    },
    {
      type: FlowNodeInputTypeEnum.JSONEditor,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.JSONEditor].icon,

      title: t('common:core.workflow.inputType.Manual input')
    },
    {
      type: FlowNodeInputTypeEnum.addInputParam,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.addInputParam].icon,

      title: t('common:core.workflow.inputType.dynamicTargetInput')
    },
    {
      type: FlowNodeInputTypeEnum.selectApp,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.selectApp].icon,

      title: t('common:core.workflow.inputType.Manual select')
    },
    {
      type: FlowNodeInputTypeEnum.selectLLMModel,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.selectLLMModel].icon,

      title: t('common:core.workflow.inputType.Manual select')
    },
    {
      type: FlowNodeInputTypeEnum.settingLLMModel,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.settingLLMModel].icon,

      title: t('common:core.workflow.inputType.Manual select')
    },
    {
      type: FlowNodeInputTypeEnum.selectDataset,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.selectDataset].icon,

      title: t('common:core.workflow.inputType.Manual select')
    },
    {
      type: FlowNodeInputTypeEnum.selectDatasetParamsModal,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.selectDatasetParamsModal].icon,

      title: t('common:core.workflow.inputType.Manual select')
    },
    {
      type: FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.settingDatasetQuotePrompt].icon,

      title: t('common:core.workflow.inputType.Manual input')
    },
    {
      type: FlowNodeInputTypeEnum.hidden,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.hidden].icon,

      title: t('common:core.workflow.inputType.Manual input')
    },
    {
      type: FlowNodeInputTypeEnum.custom,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.custom].icon,

      title: t('common:core.workflow.inputType.Manual input')
    }
  ]);

  const renderList = useMemo(
    () =>
      inputList.current.map((input) => ({
        label: input.title,
        icon: input.icon,
        renderType: input.type,
        isActive: renderType === input.type,
        onClick: () => {
          if (renderType === input.type) return;
          onChange(input.type);
        }
      })),
    [renderType]
  );

  const filterMenuList = useMemo(
    () => renderList.filter((item) => renderTypeList.includes(item.renderType)),
    [renderTypeList, renderList]
  );
  const renderTypeData = useMemo(
    () => inputList.current.find((item) => item.type === renderType) || inputList.current[0],
    [renderType]
  );

  return (
    <MyMenu
      offset={[-0.5, 0.5]}
      trigger="click"
      Button={
        <Button
          leftIcon={
            <MyIcon name={renderTypeData.icon as any} w={'14px'} color={'primary.600'} mr={-0.5} />
          }
          rightIcon={<MyIcon name={'common/select'} w={'0.8rem'} color={'myGray.500'} ml={-1} />}
          variant={'grayBase'}
          border={theme.borders.base}
          borderColor={'myGray.200'}
          borderRadius={'sm'}
          px={'10px'}
          py={'6px'}
          fontSize={'mini'}
          color={'myGray.600'}
          h={'28px'}
          bg={'myGray.100'}
        >
          <Box fontWeight={'medium'}>{renderTypeData.title}</Box>
        </Button>
      }
      menuList={[{ children: filterMenuList }]}
    />
  );
};

export default React.memo(NodeInputSelect);
