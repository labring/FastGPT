import React, { useCallback, useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import {
  Box,
  Flex,
  Textarea,
  useTheme,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Switch
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { FlowModuleItemType, ModuleItemType } from '@fastgpt/global/core/module/type.d';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { welcomeTextTip, variableTip } from '@fastgpt/global/core/module/template/tip';
import { onChangeNode } from '../../FlowProvider';

import VariableEdit from '../modules/VariableEdit';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import Container from '../modules/Container';
import NodeCard from '../render/NodeCard';
import type { VariableItemType } from '@fastgpt/global/core/module/type.d';
import QGSwitch from '@/components/core/module/Flow/components/modules/QGSwitch';
import TTSSelect from '@/components/core/module/Flow/components/modules/TTSSelect';
import { splitGuideModule } from '@fastgpt/global/core/module/utils';

const NodeUserGuide = React.memo(function NodeUserGuide({ data }: { data: FlowModuleItemType }) {
  const theme = useTheme();
  return (
    <>
      <NodeCard minW={'300px'} {...data}>
        <Container className="nodrag" borderTop={'2px solid'} borderTopColor={'myGray.200'}>
          <WelcomeText data={data} />
          <Box pt={4} pb={2}>
            <ChatStartVariable data={data} />
          </Box>
          <Box pt={3} borderTop={theme.borders.base}>
            <TTSGuide data={data} />
          </Box>
          <Box mt={3} pt={3} borderTop={theme.borders.base}>
            <QuestionGuide data={data} />
          </Box>
        </Container>
      </NodeCard>
    </>
  );
});

export default function Node({ data }: NodeProps<FlowModuleItemType>) {
  return <NodeUserGuide data={data} />;
}
export function WelcomeText({ data }: { data: FlowModuleItemType }) {
  const { inputs, moduleId } = data;

  const welcomeText = useMemo(
    () => inputs.find((item) => item.key === ModuleInputKeyEnum.welcomeText),
    [inputs]
  );

  return (
    <>
      <Flex mb={1} alignItems={'center'}>
        <MyIcon name={'core/modules/welcomeText'} mr={2} w={'16px'} color={'#E74694'} />
        <Box>开场白</Box>
        <MyTooltip label={welcomeTextTip} forceShow>
          <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
        </MyTooltip>
      </Flex>
      {welcomeText && (
        <Textarea
          className="nodrag"
          rows={6}
          resize={'both'}
          defaultValue={welcomeText.value}
          bg={'myWhite.500'}
          placeholder={welcomeTextTip}
          onChange={(e) => {
            onChangeNode({
              moduleId,
              key: ModuleInputKeyEnum.welcomeText,
              type: 'updateInput',
              value: {
                ...welcomeText,
                value: e.target.value
              }
            });
          }}
        />
      )}
    </>
  );
}

function ChatStartVariable({ data }: { data: FlowModuleItemType }) {
  const { inputs, moduleId } = data;

  const variables = useMemo(
    () =>
      (inputs.find((item) => item.key === ModuleInputKeyEnum.variables)
        ?.value as VariableItemType[]) || [],
    [inputs]
  );

  const updateVariables = useCallback(
    (value: VariableItemType[]) => {
      onChangeNode({
        moduleId,
        key: ModuleInputKeyEnum.variables,
        type: 'updateInput',
        value: {
          ...inputs.find((item) => item.key === ModuleInputKeyEnum.variables),
          value
        }
      });
    },
    [inputs, moduleId]
  );

  return <VariableEdit variables={variables} onChange={(e) => updateVariables(e)} />;
}

function QuestionGuide({ data }: { data: FlowModuleItemType }) {
  const { inputs, moduleId } = data;

  const questionGuide = useMemo(
    () =>
      (inputs.find((item) => item.key === ModuleInputKeyEnum.questionGuide)?.value as boolean) ||
      false,
    [inputs]
  );

  return (
    <QGSwitch
      isChecked={questionGuide}
      size={'lg'}
      onChange={(e) => {
        const value = e.target.checked;
        onChangeNode({
          moduleId,
          key: ModuleInputKeyEnum.questionGuide,
          type: 'updateInput',
          value: {
            ...inputs.find((item) => item.key === ModuleInputKeyEnum.questionGuide),
            value
          }
        });
      }}
    />
  );
}

function TTSGuide({ data }: { data: FlowModuleItemType }) {
  const { inputs, moduleId } = data;
  const { ttsConfig } = splitGuideModule({ inputs } as ModuleItemType);

  return (
    <TTSSelect
      value={ttsConfig}
      onChange={(e) => {
        onChangeNode({
          moduleId,
          key: ModuleInputKeyEnum.tts,
          type: 'updateInput',
          value: {
            ...inputs.find((item) => item.key === ModuleInputKeyEnum.tts),
            value: e
          }
        });
      }}
    />
  );
}
