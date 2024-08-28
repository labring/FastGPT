import { ExportChatType } from '@/types/chat';
import { ChatItemType } from '@fastgpt/global/core/chat/type';
import { useCallback } from 'react';
import { htmlTemplate } from '@/web/core/chat/constants';
import { fileDownload } from '@/web/common/file/utils';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useTranslation } from 'next-i18next';
export const useChatBox = () => {
  const { t } = useTranslation();
  const onExportChat = useCallback(
    ({ type, history }: { type: ExportChatType; history: ChatItemType[] }) => {
      const getHistoryHtml = () => {
        const historyDom = document.getElementById('history');
        if (!historyDom) return;
        const dom = Array.from(historyDom.children).map((child, i) => {
          const avatar = `<img src="${
            child.querySelector<HTMLImageElement>('.avatar')?.src
          }" alt="" />`;

          const chatContent = child.querySelector<HTMLDivElement>('.markdown');

          if (!chatContent) {
            return '';
          }

          const chatContentClone = chatContent.cloneNode(true) as HTMLDivElement;

          const codeHeader = chatContentClone.querySelectorAll('.code-header');
          codeHeader.forEach((childElement: any) => {
            childElement.remove();
          });

          return `<div class="chat-item">
            ${avatar}
            ${chatContentClone.outerHTML}
          </div>`;
        });

        const html = htmlTemplate.replace('{{CHAT_CONTENT}}', dom.join('\n'));
        return html;
      };

      const map: Record<ExportChatType, () => void> = {
        md: () => {
          fileDownload({
            text: history
              .map((item) => {
                let result = `Role: ${item.obj}\n`;
                const content = item.value.map((item) => {
                  if (item.type === ChatItemValueTypeEnum.text) {
                    return item.text?.content;
                  } else if (item.type === ChatItemValueTypeEnum.file) {
                    return `
![${item.file?.name}](${item.file?.url})
`;
                  } else if (item.type === ChatItemValueTypeEnum.tool) {
                    return `
\`\`\`Toll
${JSON.stringify(item.tools, null, 2)}
\`\`\`
`;
                  }
                });

                return result + content;
              })
              .join('\n\n-------\n\n'),
            type: 'text/markdown',
            filename: 'chat.md'
          });
        },
        html: () => {
          const html = getHistoryHtml();
          html &&
            fileDownload({
              text: html,
              type: 'text/html',
              filename: `${t('chat:chat_history')}.html`
            });
        },
        pdf: () => {
          const html = getHistoryHtml();

          html &&
            // @ts-ignore
            html2pdf(html, {
              margin: 0,
              filename: `${t('chat:chat_history')}.pdf`
            });
        }
      };

      map[type]();
    },
    []
  );

  return {
    onExportChat
  };
};
