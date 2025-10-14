import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';

const Table = dynamic(() => import('./Table'), { ssr: false });
const Indicator = dynamic(() => import('./Indicator'), { ssr: false });
const Link = dynamic(() => import('./Link'), { ssr: false });
const Tips = dynamic(() => import('./Tips'), { ssr: false });
const Divider = dynamic(() => import('./Divider'), { ssr: false });
const TextBlock = dynamic(() => import('./TextBlock'), { ssr: false });
const EChartsCodeBlock = dynamic(() => import('../../img/EChartsCodeBlock'), { ssr: false });

type RenderTypeEnum = {
  table: 'TABLE';
  indicator: 'INDICATOR';
  link: 'LINK';
  error_tips: 'ERROR_TIPS';
  warning_tips: 'WARNING_TIPS';
  divider: 'DIVIDER';
  textblock: 'TEXTBLOCK';
  chart: 'CHART';
};

type renderType =
  | {
      type: RenderTypeEnum['table'];
      content: {
        data: Array<Record<string, string>>;
      };
    }
  | {
      type: RenderTypeEnum['indicator'];
      content: {
        dataList: {
          name: string;
          value: string | number;
        }[];
      };
    }
  | {
      type: RenderTypeEnum['link'];
      content: { text: string; url: string };
    }
  | {
      type: RenderTypeEnum['error_tips'];
      content: string;
    }
  | {
      type: RenderTypeEnum['warning_tips'];
      content: string;
    }
  | {
      type: RenderTypeEnum['divider'];
      content: null;
    }
  | {
      type: RenderTypeEnum['textblock'];
      content: string;
    }
  | {
      type: RenderTypeEnum['chart'];
      content: {
        chartStructInfo: any;
        echartsData: any;
      };
    };

// convert single item to Markdown
const StructureRender = ({ code }: { code: string }) => {
  const jsonObjList: renderType[] | string = useMemo(() => {
    try {
      const jsonObj = JSON.parse(code);
      if (Array.isArray(jsonObj)) {
        return jsonObj;
      }
      return [jsonObj];
    } catch {
      return code;
    }
  }, [code]);

  if (typeof jsonObjList === 'string') {
    return String(code);
  }

  return (
    <>
      {jsonObjList.map((jsonObj, index) => {
        const { type, content } = jsonObj;
        if (!content) return '';
        if (type === 'TABLE') return <Table data={content.data} key={index}></Table>;
        if (type === 'INDICATOR')
          return <Indicator dataList={content.dataList} key={index}></Indicator>;
        if (type === 'LINK') return <Link data={content} key={index}></Link>;
        if (type === 'ERROR_TIPS') return <Tips content={content} key={index} type="error"></Tips>;
        if (type === 'WARNING_TIPS')
          return <Tips content={content} key={index} type="warning"></Tips>;
        if (type === 'DIVIDER') return <Divider key={index}></Divider>;
        if (type === 'TEXTBLOCK') return <TextBlock content={content} key={index}></TextBlock>;
        if (type === 'CHART')
          return (
            <EChartsCodeBlock
              code={JSON.stringify(content.echartsData)}
              key={index}
            ></EChartsCodeBlock>
          );
        return String(JSON.stringify(jsonObj));
      })}
    </>
  );
};

export default StructureRender;
