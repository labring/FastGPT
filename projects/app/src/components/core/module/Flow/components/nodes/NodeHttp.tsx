import React, { useCallback, useMemo, useState, useTransition } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import { Box, Flex, Input, useDisclosure } from '@chakra-ui/react';
import MySelect from '@/components/Select';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { onChangeNode } from '../../FlowProvider';
import { useTranslation } from 'next-i18next';
import Tabs from '@/components/Tabs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { EditNodeFieldType, FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import TargetHandle from '../render/TargetHandle';
import { useToast } from '@fastgpt/web/hooks/useToast';
import DeleteIcon from '@fastgpt/web/components/common/Icon/delete';
import FieldEditModal from '../render/FieldEditModal';

const NodeHttp = ({ data, selected }: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const [_, startSts] = useTransition();
  const { moduleId, inputs, outputs } = data;

  const requestMethods = inputs.find((item) => item.key === ModuleInputKeyEnum.httpMethod);
  const requestUrl = inputs.find((item) => item.key === ModuleInputKeyEnum.httpReqUrl);

  const CustomComponents = useMemo(
    () => ({
      [ModuleInputKeyEnum.httpMethod]: () => (
        <RenderHttpMethodAndUrl
          moduleId={moduleId}
          requestMethods={requestMethods}
          requestUrl={requestUrl}
        />
      )
    }),
    [moduleId, requestMethods, requestUrl]
  );

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          flowInputList={inputs}
          CustomComponent={CustomComponents}
        />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeHttp);

function RenderHttpMethodAndUrl({
  moduleId,
  requestMethods,
  requestUrl
}: {
  moduleId: string;
  requestMethods?: FlowNodeInputItemType;
  requestUrl?: FlowNodeInputItemType;
}) {
  const { t } = useTranslation();
  const [_, startSts] = useTransition();

  return (
    <Box>
      <Box mb={2}>{t('core.module.Http request settings')}</Box>
      <Flex alignItems={'center'} className="nodrag">
        <MySelect
          h={'34px'}
          w={'80px'}
          bg={'myGray.50'}
          width={'100%'}
          value={requestMethods?.value}
          list={[
            {
              label: 'GET',
              value: 'GET'
            },
            {
              label: 'POST',
              value: 'POST'
            }
          ]}
          onchange={(e) => {
            onChangeNode({
              moduleId,
              type: 'updateInput',
              key: ModuleInputKeyEnum.httpMethod,
              value: {
                ...requestMethods,
                value: e
              }
            });
          }}
        />
        <Input
          ml={2}
          h={'34px'}
          value={requestUrl?.value}
          placeholder={t('core.module.input.label.Http Request Url')}
          fontSize={'xs'}
          w={'300px'}
          onChange={(e) => {
            startSts(() => {
              onChangeNode({
                moduleId,
                type: 'updateInput',
                key: ModuleInputKeyEnum.httpReqUrl,
                value: {
                  ...requestUrl,
                  value: e.target.value
                }
              });
            });
          }}
        />
      </Flex>
    </Box>
  );
}
