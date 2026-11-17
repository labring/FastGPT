import type { StackProps } from '@chakra-ui/react';
import { Box, HStack } from '@chakra-ui/react';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

/** 配置说明统一使用悬停提示，不提供额外的详情弹窗。 */
export const Description = ({ description }: { description?: string }) => {
  return description ? <QuestionTip label={description} /> : null;
};
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
      <Description description={description} />
    </HStack>
  );
};

export default FormLabel;
