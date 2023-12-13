import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import React, { useMemo, useState } from 'react';
import FieldEditModal, { EditFieldModeType, EditFieldType } from '../../modules/FieldEditModal';
import { useTranslation } from 'react-i18next';
import { onChangeNode, useFlowProviderStore } from '../../../FlowProvider';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { Box, Flex } from '@chakra-ui/react';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import TargetHandle from '../TargetHandle';
import MyIcon from '@/components/Icon';

const InputLabel = ({
  moduleId,
  inputKey,
  editFiledType = 'input',
  ...item
}: FlowNodeInputItemType & {
  moduleId: string;
  inputKey: string;
  editFiledType?: EditFieldModeType;
}) => {
  const { t } = useTranslation();
  const { mode } = useFlowProviderStore();
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
  const [editField, setEditField] = useState<EditFieldType>();

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
            name={'settingLight'}
            w={'14px'}
            cursor={'pointer'}
            ml={3}
            _hover={{ color: 'myBlue.600' }}
            onClick={() =>
              setEditField({
                label: item.label,
                type: item.type,
                valueType: item.valueType,
                required: item.required,
                key: inputKey,
                description: item.description
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
      {!!editField && (
        <FieldEditModal
          mode={editFiledType}
          defaultField={editField}
          onClose={() => setEditField(undefined)}
          onSubmit={(e) => {
            const data = {
              ...item,
              ...e
            };
            // same key
            if (editField.key === data.key) {
              onChangeNode({
                moduleId,
                type: 'updateInput',
                key: data.key,
                value: data
              });
            } else {
              // diff key. del and add
              onChangeNode({
                moduleId,
                type: 'replaceInput',
                key: editField.key,
                value: data
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
