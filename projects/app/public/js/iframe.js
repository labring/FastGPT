function embedChatbot() {
  const chatBtnId = 'fastgpt-chatbot-button';
  const chatWindowId = 'fastgpt-chatbot-window';
  const script = document.getElementById('chatbot-iframe');
  const botSrc = script?.getAttribute('data-bot-src');
  const defaultOpen = script?.getAttribute('data-default-open') === 'true';
  const canDrag = script?.getAttribute('data-drag') === 'true';
  const MessageIcon =
    script?.getAttribute('data-open-icon') ||
    `data:image/svg+xml;base64,PHN2ZyB0PSIxNjkwNTMyNzg1NjY0IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjQxMzIiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIj48cGF0aCBkPSJNNTEyIDMyQzI0Ny4wNCAzMiAzMiAyMjQgMzIgNDY0QTQxMC4yNCA0MTAuMjQgMCAwIDAgMTcyLjQ4IDc2OEwxNjAgOTY1LjEyYTI1LjI4IDI1LjI4IDAgMCAwIDM5LjA0IDIyLjRsMTY4LTExMkE1MjguNjQgNTI4LjY0IDAgMCAwIDUxMiA4OTZjMjY0Ljk2IDAgNDgwLTE5MiA0ODAtNDMyUzc3Ni45NiAzMiA1MTIgMzJ6IG0yNDQuOCA0MTZsLTM2MS42IDMwMS43NmExMi40OCAxMi40OCAwIDAgMS0xOS44NC0xMi40OGw1OS4yLTIzMy45MmgtMTYwYTEyLjQ4IDEyLjQ4IDAgMCAxLTcuMzYtMjMuMzZsMzYxLjYtMzAxLjc2YTEyLjQ4IDEyLjQ4IDAgMCAxIDE5Ljg0IDEyLjQ4bC01OS4yIDIzMy45MmgxNjBhMTIuNDggMTIuNDggMCAwIDEgOCAyMi4wOHoiIGZpbGw9IiM0ZTgzZmQiIHAtaWQ9IjQxMzMiPjwvcGF0aD48L3N2Zz4=`;
  const CloseIcon =
    script?.getAttribute('data-close-icon') ||
    'data:image/svg+xml;base64,PHN2ZyB0PSIxNjkwNTM1NDQxNTI2IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjYzNjciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIj48cGF0aCBkPSJNNTEyIDEwMjRBNTEyIDUxMiAwIDEgMSA1MTIgMGE1MTIgNTEyIDAgMCAxIDAgMTAyNHpNMzA1Ljk1NjU3MSAzNzAuMzk1NDI5TDQ0Ny40ODggNTEyIDMwNS45NTY1NzEgNjUzLjYwNDU3MWE0NS41NjggNDUuNTY4IDAgMSAwIDY0LjQzODg1OCA2NC40Mzg4NThMNTEyIDU3Ni41MTJsMTQxLjYwNDU3MSAxNDEuNTMxNDI5YTQ1LjU2OCA0NS41NjggMCAwIDAgNjQuNDM4ODU4LTY0LjQzODg1OEw1NzYuNTEyIDUxMmwxNDEuNTMxNDI5LTE0MS42MDQ1NzFhNDUuNTY4IDQ1LjU2OCAwIDEgMC02NC40Mzg4NTgtNjQuNDM4ODU4TDUxMiA0NDcuNDg4IDM3MC4zOTU0MjkgMzA1Ljk1NjU3MWE0NS41NjggNDUuNTY4IDAgMCAwLTY0LjQzODg1OCA2NC40Mzg4NTh6IiBmaWxsPSIjNGU4M2ZkIiBwLWlkPSI2MzY4Ij48L3BhdGg+PC9zdmc+';

  if (!botSrc) {
    console.error(`Can't find appid`);
    return;
  }
  if (document.getElementById(chatBtnId)) {
    return;
  }

  const ChatBtn = document.createElement('div');
  ChatBtn.id = chatBtnId;
  ChatBtn.style.cssText =
    'position: fixed; bottom: 30px; right: 60px; width: 40px; height: 40px; cursor: pointer; z-index: 2147483647; transition: 0;';

  // btn icon
  const ChatBtnDiv = document.createElement('img');
  ChatBtnDiv.src = defaultOpen ? CloseIcon : MessageIcon;
  ChatBtnDiv.setAttribute('width', '100%');
  ChatBtnDiv.setAttribute('height', '100%');
  ChatBtnDiv.draggable = false;

  const iframe = document.createElement('iframe');
  iframe.allow = '*';
  iframe.referrerPolicy = 'no-referrer';
  iframe.title = 'FastGPT Chat Window';
  iframe.id = chatWindowId;
  iframe.src = botSrc;
  iframe.style.cssText =
    'border: none; position: fixed; flex-direction: column; justify-content: space-between; box-shadow: rgba(150, 150, 150, 0.2) 0px 10px 30px 0px, rgba(150, 150, 150, 0.2) 0px 0px 0px 1px; bottom: 80px; right: 60px; width: 375px; height: 667px; max-width: 90vw; max-height: 85vh; border-radius: 0.75rem; display: flex; z-index: 2147483647; overflow: hidden; left: unset; background-color: #F3F4F6;';
  iframe.style.visibility = defaultOpen ? 'unset' : 'hidden';

  document.body.appendChild(iframe);

  let chatBtnDragged = false;
  let chatBtnDown = false;
  let chatBtnMouseX;
  let chatBtnMouseY;
  ChatBtn.addEventListener('click', function () {
    if (chatBtnDragged) {
      chatBtnDragged = false;
      return;
    }
    const chatWindow = document.getElementById(chatWindowId);

    if (!chatWindow) return;
    const visibilityVal = chatWindow.style.visibility;
    if (visibilityVal === 'hidden') {
      chatWindow.style.visibility = 'unset';
      ChatBtnDiv.src = CloseIcon;
    } else {
      chatWindow.style.visibility = 'hidden';
      ChatBtnDiv.src = MessageIcon;
    }
  });

  ChatBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();

    if (!chatBtnMouseX && !chatBtnMouseY) {
      chatBtnMouseX = e.clientX;
      chatBtnMouseY = e.clientY;
    }

    chatBtnDown = true;
  });

  window.addEventListener('mousemove', (e) => {
    e.stopPropagation();
    if (!canDrag || !chatBtnDown) return;

    chatBtnDragged = true;
    const transformX = e.clientX - chatBtnMouseX;
    const transformY = e.clientY - chatBtnMouseY;

    ChatBtn.style.transform = `translate3d(${transformX}px, ${transformY}px, 0)`;
  });

  window.addEventListener('mouseup', (e) => {
    chatBtnDown = false;
  });

  ChatBtn.appendChild(ChatBtnDiv);
  document.body.appendChild(ChatBtn);
}
window.addEventListener('load', embedChatbot);
