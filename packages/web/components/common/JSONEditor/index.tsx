import Editor from '@monaco-editor/react';
import { useRef, useState } from 'react';
import { Box } from '@chakra-ui/react';
import MyIcon from '../Icon';

type TEditorProps = {
  value: string;
  onChange: any;
};

export default function JSONEditor({ value, onChange }: TEditorProps) {
  const [height, setHeight] = useState(200);
  const initialY = useRef(0);

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

  const handleMouseDown = (e: React.MouseEvent) => {
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
  };

  return (
    <div style={{ position: 'relative' }}>
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
      <Editor
        height={height}
        defaultLanguage="json"
        value={value}
        options={options as any}
        onChange={onChange}
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
      />
    </div>
  );
}
