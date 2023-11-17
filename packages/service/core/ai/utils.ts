import type { ChatCompletionContentPart } from '@fastgpt/global/core/ai/type.d';

/**
    string to vision model. Follow the markdown code block rule for interception:

    @rule:
    ```img-block
        {src:""}
        {src:""}
    ```
    ```file-block
        {name:"",src:""},
        {name:"",src:""}
    ```
    @example:
        What’s in this image?
        ```img-block
            {src:"https://1.png"}
        ```
    @return 
        [
            { type: 'text', text: 'What’s in this image?' },
            {
              type: 'image_url',
              image_url: {
                url: 'https://1.png'
              }
            }
        ]
 */
export function formatStr2ChatContent(str: string) {
  const IMG_BLOCK = 'img-block';
  const FILE_BLOCK = 'file-block';

  const content: ChatCompletionContentPart[] = [];
  let lastIndex = 0;
  const regex = new RegExp(`\`\`\`(${IMG_BLOCK})\\n([\\s\\S]*?)\`\`\``, 'g');

  let match;

  while ((match = regex.exec(str)) !== null) {
    // add previous text
    if (match.index > lastIndex) {
      const text = str.substring(lastIndex, match.index).trim();
      if (text) {
        content.push({ type: 'text', text });
      }
    }

    const blockType = match[1].trim();

    if (blockType === IMG_BLOCK) {
      const blockContentLines = match[2].trim().split('\n');
      const jsonLines = blockContentLines.map((item) => JSON.parse(item) as { src: string });
      content.push(
        ...jsonLines.map((item) => ({
          type: 'image_url' as any,
          image_url: {
            url: item.src
          }
        }))
      );
    }

    lastIndex = regex.lastIndex;
  }

  // add remaining text
  if (lastIndex < str.length) {
    const remainingText = str.substring(lastIndex).trim();
    if (remainingText) {
      content.push({ type: 'text', text: remainingText });
    }
  }

  // Continuous text type content, if type=text, merge them
  for (let i = 0; i < content.length - 1; i++) {
    const currentContent = content[i];
    const nextContent = content[i + 1];
    if (currentContent.type === 'text' && nextContent.type === 'text') {
      currentContent.text += nextContent.text;
      content.splice(i + 1, 1);
      i--;
    }
  }

  if (content.length === 1 && content[0].type === 'text') {
    return content[0].text;
  }
  return content ? content : null;
}
