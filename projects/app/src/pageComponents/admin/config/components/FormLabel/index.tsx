import type { StackProps } from '@chakra-ui/react';
import { Box, HStack } from '@chakra-ui/react';
import MarkDownModal from '@/components/admin/markdown/MarkDownModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const Description: React.FC<any> = ({ description }: { description?: string }) => {
  if (description) {
    return (
      <MarkDownModal source={description}>
        <QuestionTip
          display={'flex'}
          alignItems={'center'}
          label={`${description}\n\n点击查看详情`}
          cursor={'pointer'}
        />
      </MarkDownModal>
    );
  } else {
    return null;
  }
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
