import React from 'react';
import { Box, Flex, Image } from '@chakra-ui/react';

const HOVER_OPACITY_TRANSITION = 'opacity 0.3s ease-out';
/** Figma Drop shadow：默认 5%，hover 8% */
const CARD_BOX_SHADOW = {
  default: '0 4px 22px 0 rgba(0, 0, 0, 0.05)',
  hover: '0 4px 22px 0 rgba(0, 0, 0, 0.08)'
} as const;
const CARD_VIEW_BOX = '0 0 540.5 208';

type CardVariant = 'import' | 'create';
type CardVisualState = 'default' | 'hover';

type EllipseConfig = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
};

type GlowVariantConfig = {
  fill: string;
  fillOpacity: number;
  default: EllipseConfig;
  hover: EllipseConfig;
  filter: {
    default: { x: number; y: number; width: number; height: number };
    hover: { x: number; y: number; width: number; height: number };
  };
};

/** 与 Figma 导出一致：椭圆 + feGaussianBlur，仅颜色/坐标因卡片而异 */
const GLOW_VARIANT_CONFIG: Record<CardVariant, GlowVariantConfig> = {
  import: {
    fill: '#AAE2F8',
    fillOpacity: 0.3,
    default: {
      cx: 404.464,
      cy: 225.211,
      rx: 86.5957,
      ry: 163.128,
      rotate: -75.6974
    },
    hover: {
      cx: 377.858,
      cy: 197.664,
      rx: 93.7504,
      ry: 176.606,
      rotate: -85
    },
    filter: {
      default: { x: 187.203, y: 74.372, width: 434.524, height: 301.678 },
      hover: { x: 144.001, y: 45.265, width: 467.714, height: 304.797 }
    }
  },
  create: {
    fill: '#C8FDE9',
    fillOpacity: 0.45,
    default: {
      cx: 404.464,
      cy: 225.211,
      rx: 86.5957,
      ry: 163.128,
      rotate: -75.6974
    },
    hover: {
      cx: 377.858,
      cy: 197.664,
      rx: 93.7504,
      ry: 176.606,
      rotate: -85
    },
    filter: {
      default: { x: 187.203, y: 74.372, width: 434.524, height: 301.678 },
      hover: { x: 144.001, y: 45.265, width: 467.714, height: 304.797 }
    }
  }
};

type Props = {
  onClick: () => void;
  title: string;
  description: string;
  variant: CardVariant;
  actionIconSrc: string;
};

const GlowEllipseDecoration = ({
  variant,
  state,
  uid
}: {
  variant: CardVariant;
  state: CardVisualState;
  uid: string;
}) => {
  const isHover = state === 'hover';
  const config = GLOW_VARIANT_CONFIG[variant];
  const ellipse = isHover ? config.hover : config.default;
  const filterBox = isHover ? config.filter.hover : config.filter.default;
  const blurId = `${uid}-${variant}-blur`;

  return (
    <>
      <g filter={`url(#${blurId})`}>
        <ellipse
          cx={ellipse.cx}
          cy={ellipse.cy}
          rx={ellipse.rx}
          ry={ellipse.ry}
          transform={`rotate(${ellipse.rotate} ${ellipse.cx} ${ellipse.cy})`}
          fill={config.fill}
          fillOpacity={config.fillOpacity}
        />
      </g>
      <defs>
        <filter
          id={blurId}
          x={filterBox.x}
          y={filterBox.y}
          width={filterBox.width}
          height={filterBox.height}
          filterUnits={'userSpaceOnUse'}
          colorInterpolationFilters={'sRGB'}
        >
          <feFlood floodOpacity={'0'} result={'BackgroundImageFix'} />
          <feBlend
            mode={'normal'}
            in={'SourceGraphic'}
            in2={'BackgroundImageFix'}
            result={'shape'}
          />
          <feGaussianBlur stdDeviation={'28.8653'} result={'effect1_foregroundBlur'} />
        </filter>
      </defs>
    </>
  );
};

const SkillCardDecoration = ({
  variant,
  state,
  uid
}: {
  variant: CardVariant;
  state: CardVisualState;
  uid: string;
}) => {
  const isHover = state === 'hover';
  const opacityProps = isHover
    ? {
        opacity: 0,
        transition: HOVER_OPACITY_TRANSITION,
        _groupHover: { opacity: 1 }
      }
    : {
        transition: HOVER_OPACITY_TRANSITION,
        _groupHover: { opacity: 0 }
      };

  return (
    <Box
      as={'svg'}
      position={'absolute'}
      inset={0}
      w={'full'}
      h={'full'}
      viewBox={CARD_VIEW_BOX}
      fill={'none'}
      pointerEvents={'none'}
      overflow={'visible'}
      preserveAspectRatio={'none'}
      {...opacityProps}
    >
      <GlowEllipseDecoration variant={variant} state={state} uid={uid} />
    </Box>
  );
};

/**
 * Skill Dashboard 空态行动卡片：
 * 背景光晕与导入卡同实现（椭圆 + feGaussianBlur），hover 时 300ms opacity 过渡。
 */
const SkillEmptyActionCard = ({ onClick, title, description, variant, actionIconSrc }: Props) => {
  const uid = React.useId().replace(/:/g, '');

  return (
    <Flex
      role={'group'}
      position={'relative'}
      cursor={'pointer'}
      onClick={onClick}
      direction={'column'}
      alignItems={'flex-start'}
      h={'208px'}
      w={'full'}
      maxW={['full', '540px']}
      minW={0}
      p={'32px'}
      borderRadius={'12px'}
      overflow={'hidden'}
      bg={
        'linear-gradient(109deg, rgba(241, 246, 249, 0.10) 13.12%, rgba(230, 245, 242, 0.10) 83.48%), rgba(255, 255, 255, 0.80)'
      }
      boxShadow={CARD_BOX_SHADOW.default}
      transition={'box-shadow 0.3s ease-out'}
      _hover={{
        boxShadow: CARD_BOX_SHADOW.hover
      }}
    >
      <SkillCardDecoration variant={variant} state={'default'} uid={uid} />
      <SkillCardDecoration variant={variant} state={'hover'} uid={`${uid}-hover`} />

      <Flex
        position={'relative'}
        zIndex={1}
        direction={'column'}
        gap={'8px'}
        w={'full'}
        flexShrink={0}
      >
        <Box color={'myGray.600'} fontSize={'24px'} fontWeight={500} lineHeight={'32px'}>
          {title}
        </Box>
        <Box
          color={'myGray.500'}
          fontSize={'16px'}
          fontWeight={400}
          lineHeight={'24px'}
          letterSpacing={'0.5px'}
        >
          {description}
        </Box>
      </Flex>

      <Flex
        position={'relative'}
        zIndex={1}
        mt={'16px'}
        py={'16px'}
        px={'120px'}
        justifyContent={'center'}
        alignItems={'center'}
        gap={'10px'}
        alignSelf={'stretch'}
        borderRadius={'12px'}
        border={'1px dashed'}
        borderColor={'#86EFAC'}
        bg={'rgba(255, 255, 255, 0.50)'}
      >
        <Image
          src={actionIconSrc}
          alt={''}
          w={'32px'}
          h={'32px'}
          flexShrink={0}
          display={'block'}
        />
      </Flex>
    </Flex>
  );
};

export default SkillEmptyActionCard;
