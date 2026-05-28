import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Link } from '@chakra-ui/react';
import React, { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'next-i18next';

const PolicyTip = () => {
  const { feConfigs } = useSystemStore();
  const { i18n } = useTranslation();
  const tipRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [isMultiline, setIsMultiline] = useState(false);

  useEffect(() => {
    const tip = tipRef.current;
    const measure = measureRef.current;
    if (!tip || !measure) return;

    // 先按单行版本测量宽度；放不下时再使用文案中的 lineBreak 设计断点。
    const updateMultiline = () => {
      const tipWidth = tip.getBoundingClientRect().width;
      const singleLineWidth = measure.scrollWidth;

      setIsMultiline(singleLineWidth > tipWidth + 1);
    };

    const timer = setTimeout(updateMultiline, 0);
    const observer = new ResizeObserver(updateMultiline);
    observer.observe(tip);
    observer.observe(measure);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [i18n.language, feConfigs?.docUrl]);

  return (
    <>
      {feConfigs?.docUrl && (
        <Box
          ref={tipRef}
          display={'block'}
          position={'relative'}
          textAlign={isMultiline ? 'center' : 'left'}
          mt={6}
          fontSize={'mini'}
          lineHeight={'16px'}
          color={'myGray.400'}
          whiteSpace={'pre-wrap'}
        >
          <Trans
            i18nKey="login:policy_tip"
            components={{
              lineBreak: isMultiline ? <br /> : <span />,
              termsLink: (
                <Link
                  href={getDocPath('/guide/version/cloud/terms')}
                  target={'_blank'}
                  color={'primary.700'}
                />
              ),
              privacyLink: (
                <Link
                  href={getDocPath('/guide/version/cloud/privacy')}
                  target={'_blank'}
                  color={'primary.700'}
                />
              )
            }}
          />
          <Box
            ref={measureRef}
            as={'span'}
            position={'absolute'}
            visibility={'hidden'}
            pointerEvents={'none'}
            whiteSpace={'nowrap'}
            aria-hidden
          >
            <Trans
              i18nKey="login:policy_tip"
              components={{
                lineBreak: <span />,
                termsLink: <Link />,
                privacyLink: <Link />
              }}
            />
          </Box>
        </Box>
      )}
    </>
  );
};

export default PolicyTip;
