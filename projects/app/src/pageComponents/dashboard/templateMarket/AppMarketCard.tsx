import { Button, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  type AppTemplateSchemaType,
  type TemplateTypeSchemaType
} from '@fastgpt/global/core/app/type';
import { useTranslation } from 'next-i18next';
import MyCard from '@/components/MyCard';

type AppMarketCardProps = {
  item: AppTemplateSchemaType;
  templateTags: TemplateTypeSchemaType[];
  onClick: (item: AppTemplateSchemaType) => void;
};

const AppMarketCard = ({ item, templateTags, onClick }: AppMarketCardProps) => {
  const { t } = useTranslation();

  const visibleTags = item.tags
    .map((tagId) => {
      const tag = templateTags.find((tag) => tag.typeId === tagId);
      return tag ? t(tag.typeName as any) : undefined;
    })
    .filter(Boolean) as string[];

  return (
    <MyCard
      avatar={item.avatar}
      name={item.name}
      intro={item.intro}
      author={item.author}
      tags={visibleTags}
      isMarketFeatured={item.isMarketFeatured}
      experienceUrl={item.experienceUrl}
      onClick={() => onClick(item)}
      hoverAction={
        <Button
          height="24px"
          variant="primaryOutline"
          borderRadius="4px"
          fontSize="12px"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            onClick(item);
          }}
        >
          <Flex align="center" color="blue.650">
            <MyIcon name="common/addLight" w="12px" h="12px" mr="4px" display="block" />
            {t('app:templateMarket.Use')}
          </Flex>
        </Button>
      }
    />
  );
};

export default AppMarketCard;
