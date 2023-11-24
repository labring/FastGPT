import React, { useMemo, useState } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/module/node/type';
import { Box, Flex } from '@chakra-ui/react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyTooltip from '@/components/MyTooltip';
import SourceHandle from './SourceHandle';
import MyIcon from '@/components/Icon';
import dynamic from 'next/dynamic';
import { onChangeNode } from '../../FlowProvider';
import { ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import { useTranslation } from 'next-i18next';

import type { EditFieldType, EditFieldModeType } from '../modules/FieldEditModal';
const FieldEditModal = dynamic(() => import('../modules/FieldEditModal'));

export const Label = ({
  moduleId,
  outputKey,
  outputs,
  editFiledType = 'output',
  ...item
}: FlowNodeOutputItemType & {
  outputKey: string;
  moduleId: string;
  outputs: FlowNodeOutputItemType[];
  editFiledType?: EditFieldModeType;
}) => {
  const { t } = useTranslation();
  const { label = '', description, edit } = item;
  const [editField, setEditField] = useState<EditFieldType>();

  return (
    <Flex
      className="nodrag"
      cursor={'default'}
      justifyContent={'right'}
      alignItems={'center'}
      position={'relative'}
    >
      {edit && (
        <>
          <MyIcon
            name={'settingLight'}
            w={'14px'}
            cursor={'pointer'}
            mr={3}
            _hover={{ color: 'myBlue.600' }}
            onClick={() =>
              setEditField({
                label: item.label,
                valueType: item.valueType,
                key: outputKey,
                description: item.description
              })
            }
          />
          <MyIcon
            className="delete"
            name={'delete'}
            w={'14px'}
            cursor={'pointer'}
            mr={3}
            _hover={{ color: 'red.500' }}
            onClick={() => {
              onChangeNode({
                moduleId,
                type: 'delOutput',
                key: outputKey
              });
            }}
          />
        </>
      )}
      {description && (
        <MyTooltip label={t(description)} forceShow>
          <QuestionOutlineIcon display={['none', 'inline']} mr={1} />
        </MyTooltip>
      )}
      <Box>{t(label)}</Box>

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
            if (editField.key === data.key) {
              onChangeNode({
                moduleId,
                type: 'updateOutput',
                key: data.key,
                value: data
              });
            } else {
              onChangeNode({
                moduleId,
                type: 'replaceOutput',
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

const RenderOutput = ({
  moduleId,
  flowOutputList,
  editFiledType
}: {
  moduleId: string;
  flowOutputList: FlowNodeOutputItemType[];
  editFiledType?: EditFieldModeType;
}) => {
  const sortOutput = useMemo(
    () =>
      [...flowOutputList].sort((a, b) => {
        if (a.key === ModuleOutputKeyEnum.finish) return -1;
        if (b.key === ModuleOutputKeyEnum.finish) return 1;
        return 0;
      }),
    [flowOutputList]
  );

  return (
    <>
      {sortOutput.map(
        (item) =>
          item.type !== FlowNodeOutputTypeEnum.hidden && (
            <Box key={item.key} _notLast={{ mb: 7 }} position={'relative'}>
              <Label
                editFiledType={editFiledType}
                moduleId={moduleId}
                outputKey={item.key}
                outputs={sortOutput}
                {...item}
              />
              <Box mt={FlowNodeOutputTypeEnum.answer ? 0 : 2} className={'nodrag'}>
                {item.type === FlowNodeOutputTypeEnum.source && (
                  <SourceHandle handleKey={item.key} valueType={item.valueType} />
                )}
              </Box>
            </Box>
          )
      )}
    </>
  );
};

export default React.memo(RenderOutput);
