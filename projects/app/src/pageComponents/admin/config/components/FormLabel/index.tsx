import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import type { StackProps } from '@chakra-ui/react';
import { Box, HStack } from '@chakra-ui/react';
import MarkDownModal from '@/components/admin/markdown/MarkDownModal';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const Description: React.FC<any> = ({ description }: { description?: string }) => {
  const { t } = useClientTranslation('admin');
  if (description) {
    return (
      <MarkDownModal source={description}>
        <QuestionTip
          display={'flex'}
          alignItems={'center'}
          label={`${t(description.startsWith('admin:') ? description : 'admin:' + description)}\n\n${t('admin:click_for_details')}`}
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
  const { t } = useClientTranslation('admin');
  if (!title) return null;
  return (
    <HStack {...props}>
      <Box id={title} color={'myGray.900'}>
        {t(title.startsWith('admin:') ? title : 'admin:' + title)}
      </Box>
      <Description description={description} />
    </HStack>
  );
};

export default FormLabel;
