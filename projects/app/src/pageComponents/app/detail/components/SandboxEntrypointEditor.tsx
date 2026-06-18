import { Box, Flex, type BoxProps } from '@chakra-ui/react';
import { SANDBOX_ENTRYPOINT_MAX_LENGTH } from '@fastgpt/global/core/ai/sandbox/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import CodeEditor from '@fastgpt/web/components/common/Textarea/CodeEditor';
import { useTranslation } from 'next-i18next';

type SandboxEntrypointEditorProps = Omit<BoxProps, 'onChange'> & {
  value?: string;
  onChange: (value: string) => void;
};

function SandboxEntrypointEditor({ value, onChange, ...props }: SandboxEntrypointEditorProps) {
  const { t } = useTranslation();

  return (
    <Box mt={3} {...props}>
      <Flex alignItems={'center'} mb={2}>
        <FormLabel>{t('app:sandbox_entrypoint')}</FormLabel>
        <QuestionTip ml={1} label={t('app:sandbox_entrypoint_desc')} />
      </Flex>
      <CodeEditor
        value={value || ''}
        language={'sh'}
        bg={'myGray.50'}
        defaultHeight={180}
        options={{
          wordWrap: 'on'
        }}
        onChange={(e) => onChange(e.slice(0, SANDBOX_ENTRYPOINT_MAX_LENGTH))}
      />
    </Box>
  );
}

export default SandboxEntrypointEditor;
