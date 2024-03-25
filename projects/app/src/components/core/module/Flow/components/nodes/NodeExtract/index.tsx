import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex
} from '@chakra-ui/react';
import { NodeProps } from 'reactflow';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import { useTranslation } from 'next-i18next';
import NodeCard from '../../render/NodeCard';
import Container from '../../modules/Container';
import { AddIcon } from '@chakra-ui/icons';
import RenderInput from '../../render/RenderInput';
import Divider from '../../modules/Divider';
import type { ContextExtractAgentItemType } from '@fastgpt/global/core/module/type';
import RenderOutput from '../../render/RenderOutput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ExtractFieldModal, { defaultField } from './ExtractFieldModal';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';
import { onChangeNode, useFlowProviderStore } from '../../../FlowProvider';
import RenderToolInput from '../../render/RenderToolInput';
import { FlowNodeInputItemType } from '../../../../../../../../../../packages/global/core/module/node/type';

const NodeExtract = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { inputs, outputs, moduleId } = data;
  const { splitToolInputs } = useFlowProviderStore();
  const { toolInputs, commonInputs } = splitToolInputs(inputs, moduleId);
  const { t } = useTranslation();
  const [editExtractFiled, setEditExtractField] = useState<ContextExtractAgentItemType>();

  const CustomComponent = useMemo(
    () => ({
      [ModuleInputKeyEnum.extractKeys]: ({
        value: extractKeys = [],
        ...props
      }: Omit<FlowNodeInputItemType, 'value'> & {
        value?: ContextExtractAgentItemType[];
      }) => (
        <Box>
          <Flex alignItems={'center'}>
            <Box flex={'1 0 0'}>{t('core.module.extract.Target field')}</Box>
            <Button
              size={'sm'}
              variant={'whitePrimary'}
              leftIcon={<AddIcon fontSize={'10px'} />}
              onClick={() => setEditExtractField(defaultField)}
            >
              {t('core.module.extract.Add field')}
            </Button>
          </Flex>
          <Box
            mt={2}
            borderRadius={'md'}
            overflow={'hidden'}
            borderWidth={'1px'}
            borderBottom="none"
          >
            <TableContainer>
              <Table bg={'white'}>
                <Thead>
                  <Tr>
                    <Th bg={'myGray.50'}>字段 key</Th>
                    <Th bg={'myGray.50'}>字段描述</Th>
                    <Th bg={'myGray.50'}>必须</Th>
                    <Th bg={'myGray.50'}></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {extractKeys.map((item, index) => (
                    <Tr
                      key={index}
                      position={'relative'}
                      whiteSpace={'pre-wrap'}
                      wordBreak={'break-all'}
                    >
                      <Td>{item.key}</Td>
                      <Td>{item.desc}</Td>
                      <Td>{item.required ? '✔' : ''}</Td>
                      <Td whiteSpace={'nowrap'}>
                        <MyIcon
                          mr={3}
                          name={'common/settingLight'}
                          w={'16px'}
                          cursor={'pointer'}
                          onClick={() => {
                            setEditExtractField(item);
                          }}
                        />
                        <MyIcon
                          name={'delete'}
                          w={'16px'}
                          cursor={'pointer'}
                          onClick={() => {
                            onChangeNode({
                              moduleId,
                              type: 'updateInput',
                              key: ModuleInputKeyEnum.extractKeys,
                              value: {
                                ...props,
                                value: extractKeys.filter((extract) => item.key !== extract.key)
                              }
                            });

                            onChangeNode({
                              moduleId,
                              type: 'delOutput',
                              key: item.key
                            });
                          }}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      )
    }),
    [moduleId, t]
  );

  return (
    <NodeCard minW={'400px'} {...data}>
      {toolInputs.length > 0 && (
        <>
          <Divider text={t('core.module.tool.Tool input')} />
          <Container>
            <RenderToolInput moduleId={moduleId} inputs={toolInputs} />
          </Container>
        </>
      )}
      <>
        <Divider text={t('common.Input')} />
        <Container>
          <RenderInput
            moduleId={moduleId}
            flowInputList={commonInputs}
            CustomComponent={CustomComponent}
          />
        </Container>
      </>
      <>
        <Divider text={t('common.Output')} />
        <Container>
          <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
        </Container>
      </>

      {!!editExtractFiled && (
        <ExtractFieldModal
          defaultField={editExtractFiled}
          onClose={() => setEditExtractField(undefined)}
          onSubmit={(data) => {
            const extracts: ContextExtractAgentItemType[] =
              inputs.find((item) => item.key === ModuleInputKeyEnum.extractKeys)?.value || [];

            const exists = extracts.find((item) => item.key === editExtractFiled.key);

            const newInputs = exists
              ? extracts.map((item) => (item.key === editExtractFiled.key ? data : item))
              : extracts.concat(data);

            onChangeNode({
              moduleId,
              type: 'updateInput',
              key: ModuleInputKeyEnum.extractKeys,
              value: {
                ...inputs.find((input) => input.key === ModuleInputKeyEnum.extractKeys),
                value: newInputs
              }
            });

            const newOutput = {
              key: data.key,
              label: `提取结果-${data.desc}`,
              valueType: ModuleIOValueTypeEnum.string,
              type: FlowNodeOutputTypeEnum.source,
              targets: []
            };

            if (exists) {
              if (editExtractFiled.key === data.key) {
                const output = outputs.find((output) => output.key === data.key);
                // update
                onChangeNode({
                  moduleId,
                  type: 'updateOutput',
                  key: data.key,
                  value: {
                    ...output,
                    label: `提取结果-${data.desc}`
                  }
                });
              } else {
                onChangeNode({
                  moduleId,
                  type: 'replaceOutput',
                  key: editExtractFiled.key,
                  value: newOutput
                });
              }
            } else {
              onChangeNode({
                moduleId,
                type: 'addOutput',
                value: newOutput
              });
            }

            setEditExtractField(undefined);
          }}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodeExtract);
