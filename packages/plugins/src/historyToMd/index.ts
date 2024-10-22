import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';

// 定义 ValueItem 类型
type ValueItem = {
  type: string;
  text?: {
    content: string;
  };
  file?: {
    url: string;
  };
};

// 定义 Props 类型
type Props = {
  history: Array<{
    dataId: string;
    obj: string;
    value: ValueItem[];
  }>;
  historyCount: number;
};

type Response = Promise<{
  base64: string;
  markdownContent: string;
}>;

// 主函数
const main = async ({ history, historyCount }: Props): Response => {
  try {
    // 计算要提取的记录数量，最多为 history.length
    const numberOfRecords = Math.min(history.length, historyCount);

    // 取最后 numberOfRecords 条历史记录并倒序
    const limitedHistory = history.slice(-numberOfRecords);

    // 构建 Markdown 内容
    const markdownContent = limitedHistory
      .map((item) => {
        let role = item.obj === 'Human' ? '用户' : item.obj;
        let result = `Role: ${role}\n`;
        const content = item.value
          .map((valueItem) => {
            if (valueItem.type === ChatItemValueTypeEnum.text) {
              return valueItem.text?.content;
            } else if (valueItem.type === ChatItemValueTypeEnum.file) {
              return `![${valueItem.type}](${valueItem.file?.url})`;
            }
            return ''; // 确保返回一个字符串
          })
          .join('\n'); // 将内容连接为字符串

        return result + content;
      })
      .join('\n\n-------\n\n'); // 用分隔符连接每个条目

    // 将 Markdown 内容转换为 Base64
    const base64Content = Buffer.from(`\uFEFF${markdownContent}`, 'utf8').toString('base64');

    return {
      base64: base64Content,
      markdownContent: markdownContent
    };
  } catch (error) {
    console.error('Error generating markdown content:', error);
    throw new Error('Failed to generate markdown content');
  }
};

export default main;
