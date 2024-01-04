import React from 'react';
import Editor from '@monaco-editor/react';
import { useCallback, useRef, useState } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import MyIcon from '../../Icon';

type Props = Omit<BoxProps, 'onChange' | 'resize' | 'height'> & {
  height?: number;
  resize?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (e: string) => void;
};

const options = {
  lineNumbers: 'off',
  guides: {
    indentation: false
  },
  automaticLayout: true,
  minimap: {
    enabled: false
  },
  scrollbar: {
    verticalScrollbarSize: 4,
    horizontalScrollbarSize: 8,
    alwaysConsumeMouseWheel: false
  },
  lineNumbersMinChars: 0,
  fontSize: 12,
  scrollBeyondLastLine: false,
  folding: false,
  overviewRulerBorder: false,
  tabSize: 2
};

const JSONEditor = ({ defaultValue, value, onChange, resize, ...props }: Props) => {
  const [height, setHeight] = useState(props.height || 100);
  const initialY = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    initialY.current = e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - initialY.current;
      setHeight((prevHeight) => (prevHeight + deltaY < 100 ? 100 : prevHeight + deltaY));
      initialY.current = e.clientY;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <Box position={'relative'}>
      {resize && (
        <Box
          position={'absolute'}
          right={'0'}
          bottom={'0'}
          zIndex={999}
          cursor={'ns-resize'}
          px={'4px'}
          onMouseDown={handleMouseDown}
        >
          <MyIcon name={'common/editor/resizer'} width={'16px'} height={'16px'} />
        </Box>
      )}

      <Box
        borderWidth={'1px'}
        borderRadius={'base'}
        borderColor={'myGray.200'}
        py={2}
        {...props}
        height={'auto'}
      >
        <Editor
          height={height}
          defaultLanguage="json"
          options={options as any}
          theme={'JSONEditorTheme'}
          beforeMount={(monaco) => {
            monaco?.editor.defineTheme('JSONEditorTheme', {
              base: 'vs',
              inherit: true,
              rules: [],
              colors: {
                'editor.background': '#ffffff00',
                'editorLineNumber.foreground': '#aaa',
                'editorOverviewRuler.border': '#ffffff00',
                'editor.lineHighlightBackground': '#F7F8FA',
                'scrollbarSlider.background': '#E8EAEC',
                'editorIndentGuide.activeBackground': '#ddd',
                'editorIndentGuide.background': '#eee'
              }
            });
          }}
          defaultValue={defaultValue}
          value={value}
          onChange={(e) => onChange?.(e || '')}
        />
      </Box>
    </Box>
  );
};

export default React.memo(JSONEditor);
