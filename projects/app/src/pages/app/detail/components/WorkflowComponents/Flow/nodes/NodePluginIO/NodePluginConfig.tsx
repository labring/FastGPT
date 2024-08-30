import React, { Dispatch, useMemo, useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { Box, Flex } from '@chakra-ui/react';
import Container from '../../components/Container';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { AppContext } from '../../../../context';
import { AppChatConfigType, AppDetailType } from '@fastgpt/global/core/app/type';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { useCreation } from 'ahooks';
import ChatFunctionTip from '@/components/core/app/Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

type ComponentProps = {
  chatConfig: AppChatConfigType;
  setAppDetail: Dispatch<React.SetStateAction<AppDetailType>>;
};

const NodePluginConfig = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { appDetail, setAppDetail } = useContextSelector(AppContext, (v) => v);

  const chatConfig = useMemo<AppChatConfigType>(() => {
    return getAppChatConfig({
      chatConfig: appDetail.chatConfig,
      systemConfigNode: data,
      isPublicFetch: true
    });
  }, [data, appDetail]);

  useCreation(() => {
    setAppDetail((state) => ({
      ...state,
      chatConfig: {
        ...state.chatConfig,
        ...chatConfig
      }
    }));
  }, []);

  const componentsProps = useMemo(
    () => ({
      chatConfig,
      setAppDetail
    }),
    [chatConfig, setAppDetail]
  );

  return (
    <NodeCard
      selected={selected}
      menuForbid={{
        debug: true,
        rename: true,
        copy: true,
        delete: true
      }}
      {...data}
    >
      <Container w={'360px'}>
        <Instruction {...componentsProps} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodePluginConfig);

function Instruction({ chatConfig: { instruction }, setAppDetail }: ComponentProps) {
  const { t } = useTranslation();

  return (
    <>
      <Flex>
        <FormLabel color={'myGray.600'} fontWeight={'medium'} fontSize={'14px'}>
          {t('workflow:plugin.Instructions')}
        </FormLabel>
        <ChatFunctionTip type={'instruction'} />
      </Flex>
      <MyTextarea
        iconSrc={'core/app/simpleMode/chat'}
        title={t('workflow:plugin.Instructions')}
        mt={2}
        rows={6}
        fontSize={'14px'}
        bg={'white'}
        resize={'both'}
        placeholder={t('workflow:plugin.Instruction_Tip')}
        value={instruction}
        onChange={(e) => {
          setAppDetail((state) => ({
            ...state,
            chatConfig: {
              ...state.chatConfig,
              instruction: e.target.value
            }
          }));
        }}
      />
    </>
  );
}
