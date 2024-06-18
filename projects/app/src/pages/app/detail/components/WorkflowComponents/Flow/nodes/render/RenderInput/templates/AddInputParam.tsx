import React, { useCallback, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, Flex } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { EditNodeFieldType } from '@fastgpt/global/core/workflow/node/type';
import dynamic from 'next/dynamic';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import Reference from './Reference';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { AppContext } from '@/pages/app/detail/components/context';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const FieldEditModal = dynamic(() => import('../../FieldEditModal'));

const AddInputParam = (props: RenderInputProps) => {
  const { item, inputs, nodeId } = props;
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const inputValue = useMemo(() => (item.value || []) as FlowNodeInputItemType[], [item.value]);

  const [editField, setEditField] = useState<EditNodeFieldType>();
  const inputIndex = useMemo(
    () => inputs?.findIndex((input) => input.key === item.key),
    [inputs, item.key]
  );

  const onAddField = useCallback(
    ({ data }: { data: EditNodeFieldType }) => {
      if (!data.key) return;

      const newInput: FlowNodeInputItemType = {
        key: data.key,
        valueType: data.valueType,
        label: data.label || '',
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        required: data.required,
        description: data.description,
        canEdit: true,
        editField: item.editField
      };
      onChangeNode({
        nodeId,
        type: 'addInput',
        index: inputIndex ? inputIndex + 1 : 1,
        value: newInput
      });
      setEditField(undefined);
    },
    [inputIndex, item, nodeId, onChangeNode]
  );

  const Render = useMemo(() => {
    return (
      <>
        <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
          <Flex
            alignItems={'center'}
            position={'relative'}
            fontWeight={'medium'}
            color={'myGray.600'}
          >
            {t('core.workflow.Custom variable')}
            {item.description && <QuestionTip ml={1} label={t(item.description)} />}
          </Flex>
          <Box flex={'1 0 0'} />
          <Button
            variant={'whiteBase'}
            leftIcon={<SmallAddIcon />}
            iconSpacing={1}
            size={'sm'}
            onClick={() => setEditField(item.dynamicParamDefaultValue ?? {})}
          >
            {t('common.Add New')}
          </Button>
        </Flex>
        {appDetail.type === AppTypeEnum.plugin && (
          <Box mt={1}>
            <Reference {...props} />
          </Box>
        )}

        {!!editField && (
          <FieldEditModal
            editField={item.editField}
            defaultField={editField}
            keys={inputValue.map((input) => input.key)}
            onClose={() => setEditField(undefined)}
            onSubmit={onAddField}
          />
        )}
      </>
    );
  }, [
    appDetail.type,
    editField,
    inputValue,
    item.description,
    item.dynamicParamDefaultValue,
    item.editField,
    onAddField,
    props,
    t
  ]);

  return Render;
};

export default React.memo(AddInputParam);
