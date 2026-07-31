import React from 'react';
import { Box, Flex, Image } from '@chakra-ui/react';

const HOVER_OPACITY_TRANSITION = 'opacity 0.3s ease-out';
const CARD_BOX_SHADOW = {
  default: '0 4px 22px 0 rgba(0, 0, 0, 0.05)',
  hover: '0 4px 22px 0 rgba(0, 0, 0, 0.08)'
} as const;
const CARD_VIEW_BOX = '0 0 540.5 208';

type CardVariant = 'import' | 'create';

type EllipseGeometry = { cx: number; cy: number; rx: number; ry: number; rotate: number };
type FilterBox = { x: number; y: number; width: number; height: number };

/**
 * 与 Figma 导出一致：椭圆 + feGaussianBlur。
 * 两个 variant 共享同一组几何（仅光晕颜色不同），故抽出为模块常量。
 */
const ELLIPSE_DEFAULT: EllipseGeometry = {
  cx: 404.464,
  cy: 225.211,
  rx: 86.5957,
  ry: 163.128,
  rotate: -75.6974
};
const ELLIPSE_HOVER: EllipseGeometry = {
  cx: 377.858,
  cy: 197.664,
  rx: 93.7504,
  ry: 176.606,
  rotate: -85
};
const FILTER_DEFAULT: FilterBox = { x: 187.203, y: 74.372, width: 434.524, height: 301.678 };
const FILTER_HOVER: FilterBox = { x: 144.001, y: 45.265, width: 467.714, height: 304.797 };

const GLOW_VARIANT_CONFIG: Record<CardVariant, { fill: string; fillOpacity: number }> = {
  import: { fill: '#AAE2F8', fillOpacity: 0.3 },
  create: { fill: '#C8FDE9', fillOpacity: 0.45 }
};

type Props = {
  onClick: () => void;
  title: string;
  description: string;
  variant: CardVariant;
  actionIconSrc: string;
};

const GlowFilter = ({ id, box }: { id: string; box: FilterBox }) => (
  <filter
    id={id}
    x={box.x}
    y={box.y}
    width={box.width}
    height={box.height}
    filterUnits={'userSpaceOnUse'}
    colorInterpolationFilters={'sRGB'}
  >
    <feFlood floodOpacity={'0'} result={'BackgroundImageFix'} />
    <feBlend mode={'normal'} in={'SourceGraphic'} in2={'BackgroundImageFix'} result={'shape'} />
    <feGaussianBlur stdDeviation={'28.8653'} result={'effect1_foregroundBlur'} />
  </filter>
);

const SkillCardGlow = ({ variant, uid }: { variant: CardVariant; uid: string }) => {
  const color = GLOW_VARIANT_CONFIG[variant];
  const defaultFilterId = `${uid}-default-blur`;
  const hoverFilterId = `${uid}-hover-blur`;

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
      sx={{
        '& .skill-card-glow': {
          transition: HOVER_OPACITY_TRANSITION
        },
        '& .skill-card-glow-default': {
          opacity: 1
        },
        '& .skill-card-glow-hover': {
          opacity: 0
        }
      }}
    >
      <defs>
        <GlowFilter id={defaultFilterId} box={FILTER_DEFAULT} />
        <GlowFilter id={hoverFilterId} box={FILTER_HOVER} />
      </defs>
      <g className={'skill-card-glow skill-card-glow-default'} filter={`url(#${defaultFilterId})`}>
        <ellipse
          cx={ELLIPSE_DEFAULT.cx}
          cy={ELLIPSE_DEFAULT.cy}
          rx={ELLIPSE_DEFAULT.rx}
          ry={ELLIPSE_DEFAULT.ry}
          transform={`rotate(${ELLIPSE_DEFAULT.rotate} ${ELLIPSE_DEFAULT.cx} ${ELLIPSE_DEFAULT.cy})`}
          fill={color.fill}
          fillOpacity={color.fillOpacity}
        />
      </g>
      <g className={'skill-card-glow skill-card-glow-hover'} filter={`url(#${hoverFilterId})`}>
        <ellipse
          cx={ELLIPSE_HOVER.cx}
          cy={ELLIPSE_HOVER.cy}
          rx={ELLIPSE_HOVER.rx}
          ry={ELLIPSE_HOVER.ry}
          transform={`rotate(${ELLIPSE_HOVER.rotate} ${ELLIPSE_HOVER.cx} ${ELLIPSE_HOVER.cy})`}
          fill={color.fill}
          fillOpacity={color.fillOpacity}
        />
      </g>
    </Box>
  );
};

const SkillEmptyActionCard = ({ onClick, title, description, variant, actionIconSrc }: Props) => {
  const uid = React.useId().replace(/:/g, '');

  return (
    <Flex
      as={'button'}
      type={'button'}
      aria-label={title}
      textAlign={'left'}
      position={'relative'}
      cursor={'pointer'}
      onClick={onClick}
      direction={'column'}
      alignItems={'flex-start'}
      minH={'208px'}
      w={'full'}
      maxW={['full', '540px']}
      minW={0}
      p={[5, 8]}
      borderRadius={'lg'}
      overflow={'hidden'}
      bg={
        'linear-gradient(109deg, rgba(241, 246, 249, 0.10) 13.12%, rgba(230, 245, 242, 0.10) 83.48%), rgba(255, 255, 255, 0.80)'
      }
      boxShadow={CARD_BOX_SHADOW.default}
      transition={'box-shadow 0.3s ease-out'}
      _hover={{
        boxShadow: CARD_BOX_SHADOW.hover
      }}
      _focusVisible={{
        outline: '2px solid',
        outlineColor: 'primary.500',
        outlineOffset: '2px'
      }}
      sx={{
        WebkitAppearance: 'none',
        appearance: 'none',
        border: 0,
        font: 'inherit',
        '&:hover .skill-card-glow-default': {
          opacity: 0
        },
        '&:hover .skill-card-glow-hover': {
          opacity: 1
        }
      }}
    >
      <SkillCardGlow variant={variant} uid={uid} />

      <Flex position={'relative'} zIndex={1} direction={'column'} gap={2} w={'full'} flexShrink={0}>
        <Box color={'myGray.600'} fontSize={'xl'} fontWeight={'medium'} lineHeight={'32px'}>
          {title}
        </Box>
        <Box
          color={'myGray.500'}
          fontSize={'md'}
          fontWeight={'normal'}
          lineHeight={'24px'}
          letterSpacing={'0.5px'}
        >
          {description}
        </Box>
      </Flex>

      <Flex
        position={'relative'}
        zIndex={1}
        mt={4}
        py={4}
        px={[8, '120px']}
        justifyContent={'center'}
        alignItems={'center'}
        gap={2.5}
        alignSelf={'stretch'}
        borderRadius={'lg'}
        border={'1px dashed'}
        borderColor={'#86EFAC'}
        bg={'rgba(255, 255, 255, 0.50)'}
      >
        <Image src={actionIconSrc} alt={''} w={8} h={8} flexShrink={0} display={'block'} />
      </Flex>
    </Flex>
  );
};

export default SkillEmptyActionCard;
