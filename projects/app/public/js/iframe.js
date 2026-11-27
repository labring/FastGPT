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

  const ChatBtnDiv = document.createElement('img');
  ChatBtnDiv.src = defaultOpen ? CloseIcon : MessageIcon;
  ChatBtnDiv.setAttribute('width', '100%');
  ChatBtnDiv.setAttribute('height', '100%');
  ChatBtnDiv.draggable = false;

  const iframe = document.createElement('iframe');
  iframe.allow = 'microphone *; *';
  iframe.referrerPolicy = 'no-referrer';
  iframe.title = 'FastGPT Chat Window';
  iframe.id = chatWindowId;
  iframe.name = 'fastgpt-chatbot-window';
  iframe.src = botSrc;
  iframe.style.cssText =
    'border: none; position: fixed; flex-direction: column; justify-content: space-between; box-shadow: rgba(150, 150, 150, 0.2) 0px 10px 30px 0px, rgba(150, 150, 150, 0.2) 0px 0px 0px 1px; width: 375px; height: 667px; min-width: min(375px, 90%); min-height: min(240px, max(0px, calc(100% - 60px))); max-width: 90%; max-height: max(0px, calc(100% - 60px)); border-radius: 0.75rem; display: flex; z-index: 2147483647; overflow: hidden; left: unset; background-color: #F3F4F6;';
  iframe.style.visibility = defaultOpen ? 'unset' : 'hidden';

  document.body.appendChild(iframe);

  // 子页以固定 name 等待握手，只有可信子窗口可以请求宿主可见状态。
  let iframeIntersectsViewport = false;
  const sendHostVisibility = () => {
    if (!iframe.isConnected) return;
    const childOrigin = new URL(iframe.src, window.location.href).origin;
    const style = window.getComputedStyle(iframe);
    iframe.contentWindow?.postMessage(
      {
        type: 'fastgpt:host-visibility',
        handshake: true,
        visible:
          iframeIntersectsViewport &&
          document.visibilityState === 'visible' &&
          style.visibility !== 'hidden' &&
          style.display !== 'none'
      },
      childOrigin
    );
  };
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    iframeIntersectsViewport = entry.isIntersecting && entry.intersectionRatio > 0;
    sendHostVisibility();
  });
  visibilityObserver.observe(iframe);
  iframe.addEventListener('load', sendHostVisibility);
  window.addEventListener('message', (event) => {
    const childOrigin = new URL(iframe.src, window.location.href).origin;
    if (
      event.source !== iframe.contentWindow ||
      event.origin !== childOrigin ||
      event.data?.type !== 'fastgpt:visibility-ready'
    )
      return;
    sendHostVisibility();
  });
  document.addEventListener('visibilitychange', sendHostVisibility);
  const iframeStyleObserver = new MutationObserver(sendHostVisibility);
  iframeStyleObserver.observe(iframe, { attributes: true, attributeFilter: ['style'] });

  const handleSize = 18;
  const btnGap = 10;
  const minWindowWidth = 375;
  const minWindowHeight = 240;
  const verticalEdgeGap = 30;
  let horizontalAnchor = 'right';
  let verticalAnchor = 'bottom';

  const resizeHandle = document.createElement('button');
  resizeHandle.type = 'button';
  resizeHandle.setAttribute('aria-label', 'Resize chat window');
  resizeHandle.style.cssText = `position: fixed; width: ${handleSize}px; height: ${handleSize}px; padding: 0; box-sizing: border-box; margin: 0; background: transparent; border: none; border-radius: 0.75rem 0 0 0; display: flex; align-items: center; justify-content: center; cursor: nwse-resize; touch-action: none; color: #94a3b8; z-index: 2147483647;`;
  const resizeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  resizeIcon.setAttribute('width', `${handleSize}`);
  resizeIcon.setAttribute('height', `${handleSize}`);
  resizeIcon.setAttribute('viewBox', `0 0 ${handleSize} ${handleSize}`);
  resizeIcon.setAttribute('aria-hidden', 'true');
  resizeIcon.style.cssText = 'display: block; pointer-events: none;';
  [
    ['4.5', '9.5', '9.5', '4.5'],
    ['7.5', '11.5', '11.5', '7.5']
  ].forEach(([x1, y1, x2, y2]) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-linecap', 'round');
    resizeIcon.appendChild(line);
  });
  resizeHandle.appendChild(resizeIcon);
  resizeHandle.addEventListener('pointerenter', () => {
    resizeHandle.style.color = '#475569';
  });
  resizeHandle.addEventListener('pointerleave', () => {
    resizeHandle.style.color = '#94a3b8';
  });
  document.body.appendChild(resizeHandle);

  const getResizeAxisSigns = () => ({
    xSign: horizontalAnchor === 'right' ? -1 : 1,
    ySign: verticalAnchor === 'bottom' ? -1 : 1
  });

  const updateResizeHandlePosition = () => {
    if (!iframe.isConnected) {
      resizeHandle.style.visibility = 'hidden';
      return;
    }
    const rect = iframe.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      resizeHandle.style.visibility = 'hidden';
      return;
    }
    const { xSign, ySign } = getResizeAxisSigns();
    const isLeftHandle = horizontalAnchor === 'right';
    const isTopHandle = verticalAnchor === 'bottom';
    resizeHandle.style.left = `${isLeftHandle ? rect.left : rect.right - handleSize}px`;
    resizeHandle.style.top = `${isTopHandle ? rect.top : rect.bottom - handleSize}px`;
    resizeHandle.style.cursor = xSign * ySign > 0 ? 'nwse-resize' : 'nesw-resize';
    resizeHandle.style.borderRadius = isTopHandle
      ? isLeftHandle
        ? '0.75rem 0 0 0'
        : '0 0.75rem 0 0'
      : isLeftHandle
        ? '0 0 0 0.75rem'
        : '0 0 0.75rem 0';
    const rotation = isTopHandle ? (isLeftHandle ? 0 : 90) : isLeftHandle ? -90 : 180;
    resizeIcon.style.transform = `rotate(${rotation}deg)`;
    resizeHandle.style.visibility = iframe.style.visibility;
  };

  /** 获取扣除占位滚动条后的可用视口尺寸，与 position: fixed 定位坐标系保持一致。 */
  const getViewportSize = () => {
    const viewportEl =
      document.compatMode === 'BackCompat' ? document.body : document.documentElement;
    return {
      width: viewportEl?.clientWidth || window.innerWidth,
      height: viewportEl?.clientHeight || window.innerHeight
    };
  };

  /** 保持贴近入口按钮的对角锚点固定，并将调整后的窗口限制在可视区域内（上下预留对称边距）。 */
  const resizeChatWindow = (width, height) => {
    const { width: vw, height: vh } = getViewportSize();
    const rect = iframe.getBoundingClientRect();
    const availableWidth = horizontalAnchor === 'right' ? rect.right : vw - rect.left;
    const availableHeight =
      verticalAnchor === 'bottom' ? rect.bottom - verticalEdgeGap : vh - rect.top - verticalEdgeGap;
    const maxWidth = Math.max(0, Math.min(vw * 0.9, availableWidth));
    const maxHeight = Math.max(0, Math.min(vh - verticalEdgeGap * 2, availableHeight));
    iframe.style.width = `${Math.max(Math.min(minWindowWidth, maxWidth), Math.min(maxWidth, width))}px`;
    iframe.style.height = `${Math.max(Math.min(minWindowHeight, maxHeight), Math.min(maxHeight, height))}px`;
    updateResizeHandlePosition();
  };

  let resizeStart;
  resizeHandle.addEventListener('pointerdown', (event) => {
    if (resizeStart || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    try {
      resizeHandle.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
    resizeStart = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rect: iframe.getBoundingClientRect()
    };
  });
  resizeHandle.addEventListener('pointermove', (event) => {
    if (!resizeStart || event.pointerId !== resizeStart.pointerId) return;
    const { xSign, ySign } = getResizeAxisSigns();
    const width = resizeStart.rect.width + (event.clientX - resizeStart.x) * xSign;
    const height = resizeStart.rect.height + (event.clientY - resizeStart.y) * ySign;
    resizeChatWindow(width, height);
  });
  resizeHandle.addEventListener('lostpointercapture', (event) => {
    if (resizeStart?.pointerId === event.pointerId) {
      resizeStart = undefined;
    }
  });
  resizeHandle.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const { xSign, ySign } = getResizeAxisSigns();
    const deltas = {
      ArrowLeft: [-20 * xSign, 0],
      ArrowRight: [20 * xSign, 0],
      ArrowUp: [0, -20 * ySign],
      ArrowDown: [0, 20 * ySign]
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const rect = iframe.getBoundingClientRect();
    resizeChatWindow(rect.width + delta[0], rect.height + delta[1]);
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'data-bot-src') {
        const newBotSrc = script.getAttribute('data-bot-src');
        if (newBotSrc) {
          iframe.src = newBotSrc;
        }
      }
    });
  });
  observer.observe(script, {
    attributes: true,
    attributeFilter: ['data-bot-src']
  });

  let chatBtnDragged = false;
  let chatBtnDown = false;
  let chatBtnMouseX;
  let chatBtnMouseY;

  /** 按入口按钮在视口中的剩余空间自动选择展开象限，并始终将窗口钳制在可视区域内。 */
  const updateChatWindowPosition = () => {
    const chatWindow = document.getElementById(chatWindowId);
    if (!chatWindow) return;
    const btn = ChatBtn.getBoundingClientRect();
    const { width: vw, height: vh } = getViewportSize();
    const [ww, wh] = [chatWindow.offsetWidth, chatWindow.offsetHeight];

    const leftSpace = btn.left - btnGap;
    const rightSpace = vw - btn.right - btnGap;
    horizontalAnchor = leftSpace >= rightSpace ? 'right' : 'left';

    if (horizontalAnchor === 'right') {
      const right = Math.max(0, Math.min(vw - btn.left + btnGap, vw - ww));
      chatWindow.style.left = 'unset';
      chatWindow.style.right = `${right}px`;
    } else {
      const left = Math.max(0, Math.min(btn.right + btnGap, vw - ww));
      chatWindow.style.right = 'unset';
      chatWindow.style.left = `${left}px`;
    }

    const upSpace = btn.bottom - verticalEdgeGap;
    const downSpace = vh - btn.top - verticalEdgeGap;
    verticalAnchor = upSpace >= downSpace ? 'bottom' : 'top';
    const maxVerticalOffset = Math.max(0, vh - wh - verticalEdgeGap);

    if (verticalAnchor === 'bottom') {
      const desiredBottom = Math.max(verticalEdgeGap, vh - btn.bottom);
      const bottom = Math.max(0, Math.min(desiredBottom, maxVerticalOffset));
      chatWindow.style.top = 'unset';
      chatWindow.style.bottom = `${bottom}px`;
    } else {
      const desiredTop = Math.max(verticalEdgeGap, btn.top);
      const top = Math.max(0, Math.min(desiredTop, maxVerticalOffset));
      chatWindow.style.bottom = 'unset';
      chatWindow.style.top = `${top}px`;
    }

    updateResizeHandlePosition();
  };

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
      updateChatWindowPosition();
    } else {
      chatWindow.style.visibility = 'hidden';
      ChatBtnDiv.src = MessageIcon;
      updateResizeHandlePosition();
    }
    sendHostVisibility();
  });

  const isChatWindowOpen = () => iframe.style.visibility !== 'hidden';

  ChatBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    chatBtnDragged = false;
    if (!canDrag || isChatWindowOpen()) return;
    chatBtnMouseX = e.clientX;
    chatBtnMouseY = e.clientY;
    chatBtnDown = true;

    const { width: vw, height: vh } = getViewportSize();
    const btnRect = ChatBtn.getBoundingClientRect();
    ChatBtn.initialRight = vw - btnRect.right;
    ChatBtn.initialBottom = vh - btnRect.bottom;
  });

  window.addEventListener('mousemove', (e) => {
    e.stopPropagation();
    if (!canDrag || !chatBtnDown || isChatWindowOpen()) return;

    chatBtnDragged = true;

    const deltaX = e.clientX - chatBtnMouseX;
    const deltaY = e.clientY - chatBtnMouseY;

    let newRight = ChatBtn.initialRight - deltaX;
    let newBottom = ChatBtn.initialBottom - deltaY;

    const { width: vw, height: vh } = getViewportSize();
    newRight = Math.max(20, Math.min(vw - 60, newRight));
    newBottom = Math.max(30, Math.min(vh - 70, newBottom));

    ChatBtn.style.left = 'auto';
    ChatBtn.style.top = 'auto';
    ChatBtn.style.right = `${newRight}px`;
    ChatBtn.style.bottom = `${newBottom}px`;

    updateChatWindowPosition();
  });

  window.addEventListener('mouseup', (e) => {
    chatBtnDown = false;
  });

  ChatBtn.appendChild(ChatBtnDiv);
  document.body.appendChild(ChatBtn);
  updateChatWindowPosition();
  window.addEventListener('resize', () => {
    resizeStart = undefined;
    updateChatWindowPosition();
    sendHostVisibility();
  });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateResizeHandlePosition).observe(iframe);
  }
}
window.addEventListener('load', embedChatbot);
