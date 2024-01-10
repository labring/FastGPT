import { EditNodeFieldType, FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { onChangeNode, useFlowProviderStoreType } from '../../../FlowProvider';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { Box, Flex } from '@chakra-ui/react';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import TargetHandle from '../TargetHandle';
import MyIcon from '@fastgpt/web/components/common/Icon';

import dynamic from 'next/dynamic';

const FieldEditModal = dynamic(() => import('../FieldEditModal'));

type Props = FlowNodeInputItemType & {
  moduleId: string;
  inputKey: string;
  mode: useFlowProviderStoreType['mode'];
};

const InputLabel = ({ moduleId, inputKey, mode, ...item }: Props) => {
  const { t } = useTranslation();
  const {
    required = false,
    description,
    edit,
    label,
    type,
    valueType,
    showTargetInApp,
    showTargetInPlugin
  } = item;

  const [editField, setEditField] = useState<EditNodeFieldType>();

  const targetHandle = useMemo(() => {
    if (type === FlowNodeInputTypeEnum.target) return true;
    if (mode === 'app' && showTargetInApp) return true;
    if (mode === 'plugin' && showTargetInPlugin) return true;
    return false;
  }, [mode, showTargetInApp, showTargetInPlugin, type]);

  return (
    <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
      <Box position={'relative'}>
        {t(label)}
        {description && (
          <MyTooltip label={t(description)} forceShow>
            <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
          </MyTooltip>
        )}
        {required && (
          <Box
            position={'absolute'}
            top={'-2px'}
            right={'-8px'}
            color={'red.500'}
            fontWeight={'bold'}
          >
            *
          </Box>
        )}
      </Box>

      {targetHandle && <TargetHandle handleKey={inputKey} valueType={valueType} />}

      {edit && (
        <>
          <MyIcon
            name={'common/settingLight'}
            w={'14px'}
            cursor={'pointer'}
            ml={3}
            _hover={{ color: 'primary.500' }}
            onClick={() =>
              setEditField({
                inputType: type,
                valueType: valueType,
                key: inputKey,
                required,
                label,
                description
              })
            }
          />
          <MyIcon
            className="delete"
            name={'delete'}
            w={'14px'}
            cursor={'pointer'}
            ml={2}
            _hover={{ color: 'red.500' }}
            onClick={() => {
              onChangeNode({
                moduleId,
                type: 'delInput',
                key: inputKey,
                value: ''
              });
            }}
          />
        </>
      )}
      {!!editField?.key && (
        <FieldEditModal
          editField={item.editField}
          keys={[editField.key]}
          defaultField={editField}
          onClose={() => setEditField(undefined)}
          onSubmit={({ data, changeKey }) => {
            if (!data.inputType || !data.key || !data.label) return;

            const newInput: FlowNodeInputItemType = {
              ...item,
              type: data.inputType,
              valueType: data.valueType,
              key: data.key,
              required: data.required,
              label: data.label,
              description: data.description
            };

            if (changeKey) {
              onChangeNode({
                moduleId,
                type: 'replaceInput',
                key: editField.key,
                value: newInput
              });
            } else {
              onChangeNode({
                moduleId,
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
};

export default React.memo(InputLabel);
