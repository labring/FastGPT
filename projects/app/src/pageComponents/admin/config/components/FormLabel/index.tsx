import type { StackProps } from '@chakra-ui/react';
import { Box, HStack } from '@chakra-ui/react';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

/** 调用方传入已翻译的标题和说明，提示交互与新版配置表单保持一致。 */
const FormLabel = ({
  title,
  description,
  ...props
}: { title: string; description?: string } & StackProps) => {
  if (!title) return null;
  return (
    <HStack {...props}>
      <Box id={title} color={'myGray.900'}>
        {title}
      </Box>
      {description && <QuestionTip label={description} />}
    </HStack>
  );
};

export default FormLabel;
