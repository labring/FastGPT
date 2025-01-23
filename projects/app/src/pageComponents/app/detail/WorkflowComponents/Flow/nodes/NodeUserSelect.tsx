import React, { useMemo } from 'react';
import { NodeProps, Position } from 'reactflow';
import { Box, Button, HStack, Input } from '@chakra-ui/react';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { SourceHandle } from './render/Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { UserSelectOptionItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import IOTitle from '../components/IOTitle';
import RenderOutput from './render/RenderOutput';

const NodeUserSelect = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const CustomComponent = useMemo(
    () => ({
      [NodeInputKeyEnum.userSelectOptions]: ({
        key: optionKey,
        value = [],
        ...props
      }: FlowNodeInputItemType) => {
        const options = value as UserSelectOptionItemType[];
        return (
          <Box>
            {options.map((item, i) => (
              <Box key={item.key} mb={4}>
                <HStack spacing={1}>
                  <MyTooltip label={t('common:common.Delete')}>
                    <MyIcon
                      mt={0.5}
                      name={'minus'}
                      w={'0.8rem'}
                      cursor={'pointer'}
                      color={'myGray.600'}
                      _hover={{ color: 'red.600' }}
                      onClick={() => {
                        onChangeNode({
                          nodeId,
                          type: 'updateInput',
                          key: optionKey,
                          value: {
                            ...props,
                            key: optionKey,
                            value: options.filter((input) => input.key !== item.key)
                          }
                        });
                      }}
                    />
                  </MyTooltip>
                  <Box color={'myGray.600'} fontWeight={'medium'} fontSize={'sm'}>
                    {t('common:option') + (i + 1)}
                  </Box>
                </HStack>
                <Box position={'relative'} mt={1}>
                  <Input
                    defaultValue={item.value}
                    bg={'white'}
                    fontSize={'sm'}
                    onChange={(e) => {
                      const newVal = options.map((val) =>
                        val.key === item.key
                          ? {
                              ...val,
                              value: e.target.value
                            }
                          : val
                      );
                      onChangeNode({
                        nodeId,
                        type: 'updateInput',
                        key: optionKey,
                        value: {
                          ...props,
                          key: optionKey,
                          value: newVal
                        }
                      });
                    }}
                  />
                  <SourceHandle
                    nodeId={nodeId}
                    handleId={getHandleId(nodeId, 'source', item.key)}
                    position={Position.Right}
                    translate={[34, 0]}
                  />
                </Box>
              </Box>
            ))}
            <Button
              fontSize={'sm'}
              leftIcon={<MyIcon name={'common/addLight'} w={4} />}
              onClick={() => {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: optionKey,
                  value: {
                    ...props,
                    key: optionKey,
                    value: options.concat({ value: '', key: getNanoid() })
                  }
                });
              }}
            >
              {t('common:core.module.Add_option')}
            </Button>
          </Box>
        );
      }
    }),
    [nodeId, onChangeNode, t]
  );

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container>
        <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
      </Container>
      <Container>
        <IOTitle text={t('common:common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeUserSelect);
