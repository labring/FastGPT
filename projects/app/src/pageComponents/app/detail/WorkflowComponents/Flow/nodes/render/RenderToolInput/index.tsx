import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import React, { useState } from 'react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { Box, Button, Flex, Table, Thead, Tbody, Tr, Th, Td, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import { defaultToolParamFormData } from '../../components/ToolParamsEditModal/constants';
import IOTitle from '../../../components/IOTitle';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { splitToolInputsByMode } from '@/web/core/workflow/utils';
import { useIsToolNode } from '../useWorkflowDocument';
const ToolParamsEditModal = dynamic(() => import('../../components/ToolParamsEditModal'));

/** 仅 HTTP 和 Code 节点支持用户配置工具参数；旧版插件输入中的 addInputParam 不参与判定。 */
export const hasDynamicToolInput = (
  source: Pick<FlowNodeItemType, 'flowNodeType' | 'hasToolInput'>
) =>
  source.hasToolInput === true &&
  (source.flowNodeType === FlowNodeTypeEnum.httpRequest468 ||
    source.flowNodeType === FlowNodeTypeEnum.code);

/** 从 Runtime 节点类型与模板目录派生动态工具输入，避免读取 CanvasNode.data 的语义字段。 */
export const useHasDynamicToolInput = (nodeId: string) => {
  const flowNodeType = useNode(nodeId, (node) => node?.data.flowNodeType);
  const hasToolInput = moduleTemplatesFlat.find(
    (template) => template.flowNodeType === flowNodeType
  )?.hasToolInput;

  return hasDynamicToolInput({
    flowNodeType: flowNodeType as FlowNodeItemType['flowNodeType'],
    hasToolInput
  });
};

const RenderToolInput = ({
  nodeId,
  inputs
}: {
  nodeId: string;
  inputs: FlowNodeInputItemType[];
}) => {
  const { t } = useTranslation();
  const isTool = useIsToolNode(nodeId);
  const nodeActions = useNodeActions(nodeId);
  const { toolInputs } = useMemoEnhance(
    () => splitToolInputsByMode(inputs, isTool),
    [inputs, isTool]
  );

  const [editField, setEditField] = useState<FlowNodeInputItemType>();

  return (
    <>
      <HStack mb={2} justifyContent={'space-between'}>
        <IOTitle text={t('workflow:tool_input')} mb={0} />
        <Button
          variant={'whiteBase'}
          leftIcon={<SmallAddIcon />}
          iconSpacing={1}
          size={'sm'}
          onClick={() => setEditField(defaultToolParamFormData)}
        >
          {t('common:add_new')}
        </Button>
      </HStack>

      <Box borderRadius={'md'} overflow={'hidden'} border={'base'}>
        <FixedTableContainer flush className="nodrag nowheel">
          <Table bg={'white'}>
            <Thead>
              <Tr>
                <Th>{t('workflow:tool_params.params_name')}</Th>
                <Th>{t('workflow:tool_params.params_description')}</Th>
                <Th>{t('workflow:field_required')}</Th>
                <Th w={'100px'} minW={'100px'}>
                  {t('common:Operation')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {toolInputs.map((item, index) => (
                <Tr
                  key={index}
                  position={'relative'}
                  whiteSpace={'pre-wrap'}
                  wordBreak={'break-all'}
                >
                  <Td>{item.key}</Td>
                  <Td>{item.toolDescription}</Td>
                  <Td>{item.required ? '✔' : ''}</Td>
                  <Td w={'100px'} minW={'100px'} whiteSpace={'nowrap'} verticalAlign={'middle'}>
                    <Flex h={'24px'} alignItems={'center'}>
                      <MyIcon
                        mr={3}
                        name={'common/settingLight'}
                        w={'16px'}
                        cursor={'pointer'}
                        onClick={() => setEditField(item)}
                      />
                      <MyIcon
                        name={'delete'}
                        w={'16px'}
                        cursor={'pointer'}
                        onClick={() => {
                          // 删除工具参数是记录级变更：以派发瞬间的 inputs 为基线整份提交。
                          nodeActions?.updateNode((current) => ({
                            inputs: current.inputs.filter((input) => input.key !== item.key)
                          }));
                        }}
                      />
                    </Flex>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </FixedTableContainer>
      </Box>

      {!!editField && (
        <ToolParamsEditModal
          defaultValue={editField}
          existingKeys={inputs.map((input) => input.key)}
          syncOutput={false}
          nodeId={nodeId}
          onClose={() => setEditField(undefined)}
        />
      )}
    </>
  );
};

export default React.memo(RenderToolInput);
