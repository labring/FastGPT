chrome.storage.local.get(["showChatBot"], function (result) {
    if (result.showChatBot === undefined || result.showChatBot) {
        const chatBtnId = 'fastgpt-chatbot-button';
        const chatWindowId = 'fastgpt-chatbot-window';
        const chatWindowWrapperId = 'fastgpt-chatbot-wrapper';
        const defaultOpen = false;
        const canDrag = true;
        const MessageIcon =
            `data:image/svg+xml;base64,PHN2ZyB0PSIxNjkwNTMyNzg1NjY0IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjQxMzIiIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIj48cGF0aCBkPSJNNTEyIDMyQzI0Ny4wNCAzMiAzMiAyMjQgMzIgNDY0QTQxMC4yNCA0MTAuMjQgMCAwIDAgMTcyLjQ4IDc2OEwxNjAgOTY1LjEyYTI1LjI4IDI1LjI4IDAgMCAwIDM5LjA0IDIyLjRsMTY4LTExMkE1MjguNjQgNTI4LjY0IDAgMCAwIDUxMiA4OTZjMjY0Ljk2IDAgNDgwLTE5MiA0ODAtNDMyUzc3Ni45NiAzMiA1MTIgMzJ6IG0yNDQuOCA0MTZsLTM2MS42IDMwMS43NmExMi40OCAxMi40OCAwIDAgMS0xOS44NC0xMi40OGw1OS4yLTIzMy45MmgtMTYwYTEyLjQ4IDEyLjQ4IDAgMCAxLTcuMzYtMjMuMzZsMzYxLjYtMzAxLjc2YTEyLjQ4IDEyLjQ4IDAgMCAxIDE5Ljg0IDEyLjQ4bC01OS4yIDIzMy45MmgxNjBhMTIuNDggMTIuNDggMCAwIDEgOCAyMi4wOHoiIGZpbGw9IiM0ZTgzZmQiIHAtaWQ9IjQxMzMiPjwvcGF0aD48L3N2Zz4=`;
        const CloseIcon =
            'data:image/svg+xml;base64,PHN2ZyB0PSIxNjkwNTM1NDQxNTI2IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjYzNjciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIj48cGF0aCBkPSJNNTEyIDEwMjRBNTEyIDUxMiAwIDEgMSA1MTIgMGE1MTIgNTEyIDAgMCAxIDAgMTAyNHpNMzA1Ljk1NjU3MSAzNzAuMzk1NDI5TDQ0Ny40ODggNTEyIDMwNS45NTY1NzEgNjUzLjYwNDU3MWE0NS41NjggNDUuNTY4IDAgMSAwIDY0LjQzODg1OCA2NC40Mzg4NThMNTEyIDU3Ni41MTJsMTQxLjYwNDU3MSAxNDEuNTMxNDI5YTQ1LjU2OCA0NS41NjggMCAwIDAgNjQuNDM4ODU4LTY0LjQzODg1OEw1NzYuNTEyIDUxMmwxNDEuNTMxNDI5LTE0MS42MDQ1NzFhNDUuNTY4IDQ1LjU2OCAwIDEgMC02NC40Mzg4NTgtNjQuNDM4ODU4TDUxMiA0NDcuNDg4IDM3MC4zOTU0MjkgMzA1Ljk1NjU3MWE0NS41NjggNDUuNTY4IDAgMCAwLTY0LjQzODg1OCA2NC40Mzg4NTh6IiBmaWxsPSIjNGU4M2ZkIiBwLWlkPSI2MzY4Ij48L3BhdGg+PC9zdmc+';
        const FullscreenIcon =
            'data:image/png;base64,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';
        const ChatBtn = document.createElement('div');
        ChatBtn.id = chatBtnId;
        ChatBtn.style.cssText =
            'position: fixed; bottom: 30px; right: 60px; width: 40px; height: 40px; cursor: pointer; z-index: 2147483647; transition: 0;';

        const ChatBtnDiv = document.createElement('img');
        ChatBtnDiv.src = defaultOpen ? CloseIcon : MessageIcon;
        ChatBtnDiv.setAttribute('width', '100%');
        ChatBtnDiv.setAttribute('height', '100%');
        ChatBtnDiv.draggable = false;

        const iframeWrapper = document.createElement('div');
        iframeWrapper.id = chatWindowWrapperId;
        iframeWrapper.style.cssText =
            'border: none; position: fixed; flex-direction: column; justify-content: space-between; box-shadow: rgba(150, 150, 150, 0.2) 0px 10px 30px 0px, rgba(150, 150, 150, 0.2) 0px 0px 0px 1px; bottom: 80px; right: 60px; max-width: 90vw; min-width: 10vw; max-height: 85vh; min-height: 15vh; border-radius: 0.75rem; display: flex; z-index: 2147483647; overflow: hidden; left: unset; background-color: #F3F4F6;';
        iframeWrapper.style.visibility = defaultOpen ? 'unset' : 'hidden';

        const iframe = document.createElement('iframe');
        iframe.referrerPolicy = 'no-referrer';
        iframe.title = 'FastGPT Chat Window';
        iframe.id = chatWindowId;
        iframe.style.cssText = 'border: none; width: 100%; height: 100%;';

        iframeWrapper.appendChild(iframe);

        const fullscreenBtn = document.createElement('img');
        fullscreenBtn.src = FullscreenIcon;
        fullscreenBtn.style.position = 'absolute';
        fullscreenBtn.style.background = 'none';
        fullscreenBtn.style.border = 'none';
        fullscreenBtn.style.cursor = 'pointer';
        fullscreenBtn.id = 'fullscreenBtn';
        fullscreenBtn.style.width = '35px';

        fullscreenBtn.addEventListener('click', function () {
            const botSrc = iframe.src;
            if (botSrc) {
                window.open(botSrc, '_blank');
            }
        });
        document.body.appendChild(iframeWrapper);

        let chatBtnDragged = false;
        let chatBtnDown = false;
        let chatBtnMouseX;
        let chatBtnMouseY;

        ChatBtn.addEventListener('click', function () {
            if (chatBtnDragged) {
                chatBtnDragged = false;
                return;
            }
            const chatWindow = document.getElementById(chatWindowWrapperId);
            if (!chatWindow) return;

            const visibilityVal = chatWindow.style.visibility;
            if (visibilityVal === 'hidden') {
                ChatBtnDiv.src = CloseIcon;
                chrome.storage.local.get(["chatbotSrc", "shareId", "chatId", "fastUID", "chatBotWidth", "chatBotHeight"], function (result) {
                    let botSrc = result.chatbotSrc;
                    if (!botSrc || botSrc === 'about:blank' || botSrc === '') {
                        console.log("Can't find botSrc");
                        iframe.src = 'data:text/html;charset=utf-8,<html><head><style>body { margin: 0; padding: 0; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100%; }</style></head><body>没有配置机器人地址</body></html>';
                        chatWindow.style.visibility = 'unset';
                        return;
                    }
                    let fastUID = result.fastUID;
                    if (!fastUID || fastUID === '') {
                        fastUID = generateUUID();
                        chrome.storage.local.set({
                            fastUID: fastUID
                        });
                    }
                    chrome.runtime.sendMessage({
                        action: "startRequestInterception",
                        chatbotSrc: botSrc
                    });
                    console.log('fastUID:', fastUID);
                    botSrc = botSrc + "&authToken=" + fastUID;
                    if (botSrc.includes(result.shareId)) {
                        botSrc = botSrc + "&chatId=" + result.chatId;
                    }
                    if (result.chatBotWidth && result.chatBotHeight) {
                        chatWindow.style.width = result.chatBotWidth + 'px';
                        chatWindow.style.height = result.chatBotHeight + 'px';
                    } else {
                        chatWindow.style.width = '400px';
                        chatWindow.style.height = '700px';
                    }
                    iframe.src = 'about:blank';
                    iframe.onload = function () {
                        chatWindow.style.visibility = 'unset';
                    }
                    adjustIframePosition(chatWindow);
                    enableResize(iframeWrapper);
                    setTimeout(() => {
                        iframe.src = botSrc;
                        iframe.onload = function () {
                            if (parseInt(chatWindow.style.width, 10) >= 900) {
                                fullscreenBtn.style.top = '13px';
                                fullscreenBtn.style.right = '60px';
                            } else {
                                fullscreenBtn.style.top = '6px';
                                fullscreenBtn.style.right = '50px';
                            }
                            chatWindow.appendChild(fullscreenBtn);
                        };
                    }, 100);
                });

            } else {
                chatWindow.style.visibility = 'hidden';
                const tmpBtn = document.getElementById('fullscreenBtn');
                if (tmpBtn) {
                    chatWindow.removeChild(tmpBtn);
                }
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

        window.addEventListener('mousemove', throttle(handleMouseMove, 16)); // 60fps
        window.addEventListener('mouseup', handleMouseUp);

        function handleMouseMove(e) {
            e.stopPropagation();
            if (!canDrag || !chatBtnDown) return;

            chatBtnDragged = true;
            const transformX = e.clientX - chatBtnMouseX;
            const transformY = e.clientY - chatBtnMouseY;

            ChatBtn.style.transform = `translate3d(${transformX}px, ${transformY}px, 0)`;

            adjustIframePosition(document.getElementById(chatWindowWrapperId));
        }

        function handleMouseUp(e) {
            chatBtnDown = false;
            adjustIframePosition(document.getElementById(chatWindowWrapperId));

            window.removeEventListener('mousemove', handleMouseMove);
        }

        ChatBtn.appendChild(ChatBtnDiv);
        document.body.appendChild(ChatBtn);

        function generateUUID() {
            const randomString = 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
                const randomHex = (Math.random() * 16) | 0;
                return randomHex.toString(16);
            });

            const timestamp = Date.now().toString(16);

            const extraRandom = (Math.random() * 1e16).toString(16);

            return `${randomString}-${timestamp}-${extraRandom}`;
        }

        function adjustIframePosition(chatWindow) {
            const chatBtnRect = ChatBtn.getBoundingClientRect();
            const chatBtnWidth = chatBtnRect.width;
            const chatBtnHeight = chatBtnRect.height;
            const chatBtnLeft = chatBtnRect.left;
            const chatBtnTop = chatBtnRect.top;

            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            const iframeWidth = parseInt(chatWindow.style.width, 10);
            const iframeHeight = parseInt(chatWindow.style.height, 10);

            const iframeTopLeft = {x: chatBtnLeft - iframeWidth, y: chatBtnTop - iframeHeight};
            const iframeTopRight = {x: chatBtnLeft + chatBtnWidth, y: chatBtnTop - iframeHeight};
            const iframeBottomLeft = {x: chatBtnLeft - iframeWidth, y: chatBtnTop + chatBtnHeight};
            const iframeBottomRight = {x: chatBtnLeft + chatBtnWidth, y: chatBtnTop + chatBtnHeight};

            let bestPosition = iframeTopLeft;
            let bestDistance = Infinity;

            const positions = [iframeTopLeft, iframeTopRight, iframeBottomLeft, iframeBottomRight];
            positions.forEach(position => {
                const distance = Math.sqrt(Math.pow(position.x, 2) + Math.pow(position.y, 2));

                if (position.x + iframeWidth > screenWidth) {
                    position.x = screenWidth - iframeWidth;
                }
                if (position.x < 0) {
                    position.x = 0;
                }
                if (position.y + iframeHeight > screenHeight) {
                    position.y = screenHeight - iframeHeight;
                }
                if (position.y < 0) {
                    position.y = 0;
                }

                if (distance < bestDistance) {
                    bestPosition = position;
                    bestDistance = distance;
                }
            });

            chatWindow.style.left = `${bestPosition.x}px`;
            chatWindow.style.top = `${bestPosition.y}px`;
        }

        function throttle(func, limit) {
            let lastFunc;
            let lastRan;
            return function () {
                const context = this;
                const args = arguments;
                if (!lastRan) {
                    func.apply(context, args);
                    lastRan = Date.now();
                } else {
                    clearTimeout(lastFunc);
                    lastFunc = setTimeout(function () {
                        if ((Date.now() - lastRan) >= limit) {
                            func.apply(context, args);
                            lastRan = Date.now();
                        }
                    }, limit - (Date.now() - lastRan));
                }
            }
        }

        function enableResize(iframeWrapper) {
            let isResizing = false;
            let lastDownX = 0;
            let lastDownY = 0;
            let resizeDirection = '';

            // 创建八个调整大小的句柄
            const handles = ['nw-resize', 'ne-resize', 'sw-resize', 'se-resize', 'n-resize', 's-resize', 'w-resize', 'e-resize'];
            const directions = ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'];

            handles.forEach((cursorType, index) => {
                const handle = createResizeHandle(cursorType);
                iframeWrapper.appendChild(handle);
                positionHandle(handle, directions[index]);
                handle.addEventListener('mousedown', (e) => startResizing(e, directions[index]));
            });

            function createResizeHandle(cursorType) {
                const handle = document.createElement('div');
                handle.style.width = '15px';
                handle.style.height = '15px';
                handle.style.background = 'transparent';
                handle.style.position = 'absolute';
                handle.style.cursor = cursorType;
                return handle;
            }

            function positionHandle(handle, direction) {
                switch (direction) {
                    case 'tl':
                        handle.style.top = '0';
                        handle.style.left = '0';
                        break;
                    case 'tr':
                        handle.style.top = '0';
                        handle.style.right = '0';
                        break;
                    case 'bl':
                        handle.style.bottom = '0';
                        handle.style.left = '0';
                        break;
                    case 'br':
                        handle.style.bottom = '0';
                        handle.style.right = '0';
                        break;
                    case 't':
                        handle.style.top = '0';
                        handle.style.left = '50%';
                        handle.style.transform = 'translateX(-50%)';
                        handle.style.width = `${iframeWrapper.offsetWidth - 30}px`;
                        handle.style.height = '3px';
                        break;
                    case 'b':
                        handle.style.bottom = '0';
                        handle.style.left = '50%';
                        handle.style.transform = 'translateX(-50%)';
                        handle.style.width = `${iframeWrapper.offsetWidth - 30}px`;
                        handle.style.height = '3px';
                        break;
                    case 'l':
                        handle.style.top = '50%';
                        handle.style.left = '0';
                        handle.style.transform = 'translateY(-50%)';
                        handle.style.width = '3px';
                        handle.style.height = `${iframeWrapper.offsetHeight - 30}px`;
                        break;
                    case 'r':
                        handle.style.top = '50%';
                        handle.style.right = '0';
                        handle.style.transform = 'translateY(-50%)';
                        handle.style.width = '3px';
                        handle.style.height = `${iframeWrapper.offsetHeight - 30}px`;
                        break;
                }
            }

            function startResizing(e, direction) {
                isResizing = true;
                lastDownX = e.clientX;
                lastDownY = e.clientY;
                resizeDirection = direction;
                iframeWrapper.style.pointerEvents = 'none'; // 禁用 iframe 的鼠标事件
                e.preventDefault();
            }

            document.addEventListener('mousemove', throttle(handleResizeMouseMove, 50));
            document.addEventListener('mouseup', handleResizeMouseUp);

            function handleResizeMouseMove(e) {
                if (!isResizing) return;

                const offsetX = e.clientX - lastDownX;
                const offsetY = e.clientY - lastDownY;
                requestAnimationFrame(() => {
                    switch (resizeDirection) {
                        case 'tl':
                            iframeWrapper.style.width = `${iframeWrapper.offsetWidth - offsetX}px`;
                            iframeWrapper.style.height = `${iframeWrapper.offsetHeight - offsetY}px`;
                            iframeWrapper.style.left = `${iframeWrapper.offsetLeft + offsetX}px`;
                            iframeWrapper.style.top = `${iframeWrapper.offsetTop + offsetY}px`;
                            break;
                        case 'tr':
                            iframeWrapper.style.width = `${iframeWrapper.offsetWidth + offsetX}px`;
                            iframeWrapper.style.height = `${iframeWrapper.offsetHeight - offsetY}px`;
                            iframeWrapper.style.top = `${iframeWrapper.offsetTop + offsetY}px`;
                            break;
                        case 'bl':
                            iframeWrapper.style.width = `${iframeWrapper.offsetWidth - offsetX}px`;
                            iframeWrapper.style.height = `${iframeWrapper.offsetHeight + offsetY}px`;
                            iframeWrapper.style.left = `${iframeWrapper.offsetLeft + offsetX}px`;
                            break;
                        case 'br':
                            iframeWrapper.style.width = `${iframeWrapper.offsetWidth + offsetX}px`;
                            iframeWrapper.style.height = `${iframeWrapper.offsetHeight + offsetY}px`;
                            break;
                        case 't':
                            iframeWrapper.style.height = `${iframeWrapper.offsetHeight - offsetY}px`;
                            iframeWrapper.style.top = `${iframeWrapper.offsetTop + offsetY}px`;
                            break;
                        case 'b':
                            iframeWrapper.style.height = `${iframeWrapper.offsetHeight + offsetY}px`;
                            break;
                        case 'l':
                            iframeWrapper.style.width = `${iframeWrapper.offsetWidth - offsetX}px`;
                            iframeWrapper.style.left = `${iframeWrapper.offsetLeft + offsetX}px`;
                            break;
                        case 'r':
                            iframeWrapper.style.width = `${iframeWrapper.offsetWidth + offsetX}px`;
                            break;
                    }
                    lastDownX = e.clientX;
                    lastDownY = e.clientY;
                });
            }

            function handleResizeMouseUp() {
                console.log('handleResizeMouseUp');
                if (isResizing) {
                    isResizing = false; // 将 isResizing 重置为 false
                    enableResize(iframeWrapper);
                    iframeWrapper.style.pointerEvents = 'auto'; // 恢复 iframe 的鼠标事件
                    chrome.storage.local.set({
                        chatBotWidth: iframeWrapper.offsetWidth,
                        chatBotHeight: iframeWrapper.offsetHeight
                    });
                }
            }
        }
    }
});
