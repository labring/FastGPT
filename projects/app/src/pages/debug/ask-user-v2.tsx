import { Box, Button, Flex } from '@chakra-ui/react';
import type {
  UserInputInteractive,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import NextHead from '@/components/common/NextHead';
import AgentAskComposer from '@/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer';
import RenderAgentAskInteractive from '@/components/core/chat/components/AIResponseBox/RenderAgentAskInteractive';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo, useState } from 'react';

const questions = [
  {
    key: 'focus',
    label: '本轮调试重点是什么？',
    options: ['选择组件', '聊天记录', '两者都检查']
  },
  {
    key: 'uncertain_answer',
    label: '希望如何处理未确定的答案？',
    options: ['填写自定义答案', '跳过此题', '继续确认']
  }
];

const AskUserV2DebugPage = () => {
  const { t } = useTranslation();
  const [askVersion, setAskVersion] = useState(1);
  const [answers, setAnswers] = useState<Record<string, string>>();
  const interactive = useMemo<UserInputInteractive & WorkflowInteractiveResponseType>(
    () => ({
      entryNodeIds: [],
      memoryEdges: [],
      nodeOutputs: [],
      type: 'userInput',
      params: {
        description: '为了继续处理当前任务，需要确认以下信息。',
        renderMode: 'agentAsk',
        submitted: !!answers,
        inputForm: questions.map((question) => ({
          type: FlowNodeInputTypeEnum.select,
          key: question.key,
          label: question.label,
          value: answers?.[question.key] ?? '',
          valueType: WorkflowIOValueTypeEnum.string,
          required: false,
          list: question.options.map((option) => ({ label: option, value: option }))
        }))
      }
    }),
    [answers]
  );
  const submit = useCallback((text: string) => {
    setAnswers(JSON.parse(text) as Record<string, string>);
  }, []);
  const reset = useCallback(() => {
    setAnswers(undefined);
    setAskVersion((version) => version + 1);
  }, []);

  return (
    <Flex h={'100%'} minH={0} direction={'column'} bg={'myGray.100'} overflow={'auto'}>
      <NextHead title={'ask_user v2'} />
      <Flex
        w={'100%'}
        maxW={'900px'}
        minH={'100%'}
        mx={'auto'}
        px={[4, 6]}
        py={[5, 8]}
        direction={'column'}
      >
        <Flex alignItems={'center'} justifyContent={'space-between'} mb={5}>
          <Box fontSize={'lg'} fontWeight={600} color={'myGray.900'}>
            ask_user v2
          </Box>
          <Button variant={'whiteBase'} size={'sm'} onClick={reset}>
            {t('common:Reset')}
          </Button>
        </Flex>
        <Flex
          flex={'1 0 auto'}
          minH={'520px'}
          direction={'column'}
          bg={'white'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'md'}
          overflow={'hidden'}
        >
          <Flex
            flex={'1 0 auto'}
            minH={0}
            direction={'column'}
            gap={5}
            overflow={'auto'}
            p={[4, 6]}
          >
            <Box maxW={'700px'} color={'myGray.900'} lineHeight={1.75}>
              {interactive.params.description}
            </Box>
            {answers && (
              <Box maxW={'700px'}>
                <RenderAgentAskInteractive interactive={interactive} />
              </Box>
            )}
          </Flex>
          {!answers && (
            <Box borderTop={'1px solid'} borderColor={'myGray.200'} bg={'myGray.25'} p={[4, 5]}>
              <AgentAskComposer key={askVersion} interactive={interactive} onSubmit={submit} />
            </Box>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
};

export default AskUserV2DebugPage;

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context, ['chat']))
    }
  };
}
