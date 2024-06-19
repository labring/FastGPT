import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import MyIcon from '@fastgpt/web/components/common/Icon';

import dynamic from 'next/dynamic';
import { EditNodeFieldType } from '@fastgpt/global/core/workflow/node/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import ValueTypeLabel from '../ValueTypeLabel';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
const FieldEditModal = dynamic(() => import('../FieldEditModal'));

type Props = {
  nodeId: string;
  input: FlowNodeInputItemType;
};

const InputLabel = ({ nodeId, input }: Props) => {
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const {
    description,
    toolDescription,
    required,
    label,
    selectedTypeIndex,
    renderTypeList,
    valueType,
    canEdit,
    key
  } = input;
  const [editField, setEditField] = useState<EditNodeFieldType>();

  const onChangeRenderType = useCallback(
    (e: string) => {
      const index = renderTypeList.findIndex((item) => item === e) || 0;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: input.key,
        value: {
          ...input,
          selectedTypeIndex: index,
          value: undefined
        }
      });
    },
    [input, nodeId, onChangeNode, renderTypeList]
  );

  const RenderLabel = useMemo(() => {
    const renderType = renderTypeList?.[selectedTypeIndex || 0];

    return (
      <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
        <Flex
          alignItems={'center'}
          position={'relative'}
          fontWeight={'medium'}
          color={'myGray.600'}
        >
          {required && (
            <Box position={'absolute'} left={-2} top={-1} color={'red.600'}>
              *
            </Box>
          )}
          {t(label)}
          {description && <QuestionTip ml={1} label={t(description)}></QuestionTip>}
        </Flex>
        {/* value type */}
        {renderType === FlowNodeInputTypeEnum.reference && <ValueTypeLabel valueType={valueType} />}
        {/* edit config */}
        {canEdit && (
          <>
            {input.editField && Object.keys(input.editField).length > 0 && (
              <MyIcon
                name={'common/settingLight'}
                w={'14px'}
                cursor={'pointer'}
                ml={3}
                color={'myGray.600'}
                _hover={{ color: 'primary.500' }}
                onClick={() =>
                  setEditField({
                    ...input,
                    inputType: renderTypeList[0],
                    valueType: valueType,
                    key,
                    label,
                    description,
                    isToolInput: !!toolDescription
                  })
                }
              />
            )}
            <MyIcon
              className="delete"
              name={'delete'}
              w={'14px'}
              color={'myGray.600'}
              cursor={'pointer'}
              ml={2}
              _hover={{ color: 'red.500' }}
              onClick={() => {
                onChangeNode({
                  nodeId,
                  type: 'delInput',
                  key: key
                });
                onChangeNode({
                  nodeId,
                  type: 'delOutput',
                  key: key
                });
              }}
            />
          </>
        )}
        {/* input type select */}
        {renderTypeList && renderTypeList.length > 1 && (
          <Box ml={2}>
            <NodeInputSelect
              renderTypeList={renderTypeList}
              renderTypeIndex={selectedTypeIndex}
              onChange={onChangeRenderType}
            />
          </Box>
        )}

        {!!editField?.key && (
          <FieldEditModal
            editField={input.editField}
            keys={[editField.key]}
            defaultField={editField}
            onClose={() => setEditField(undefined)}
            onSubmit={({ data, changeKey }) => {
              if (!data.inputType || !data.key || !data.label || !editField.key) return;

              const newInput: FlowNodeInputItemType = {
                ...input,
                renderTypeList: [data.inputType],
                valueType: data.valueType,
                key: data.key,
                required: data.required,
                label: data.label,
                description: data.description,
                toolDescription: data.isToolInput ? data.description : undefined,
                maxLength: data.maxLength,
                value: data.defaultValue,
                max: data.max,
                min: data.min
              };

              if (changeKey) {
                onChangeNode({
                  nodeId,
                  type: 'replaceInput',
                  key: editField.key,
                  value: newInput
                });
              } else {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: newInput.key,
                  value: newInput
                });
              }
              setEditField(undefined);
            }}
          />
        )}
      </Flex>
    );
  }, [
    canEdit,
    description,
    editField,
    input,
    key,
    label,
    nodeId,
    onChangeNode,
    onChangeRenderType,
    renderTypeList,
    required,
    selectedTypeIndex,
    t,
    toolDescription,
    valueType
  ]);

  return RenderLabel;
};

export default React.memo(InputLabel);
