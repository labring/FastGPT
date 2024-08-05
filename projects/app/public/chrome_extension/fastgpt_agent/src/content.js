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
        const SwitchIcon =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAAAAAXNSR0IArs4c6QAAB+1JREFUeF7tnVt22zgMQNX9cBHJypqsrFkE9zMz7MinnowfIiEYr+uffkQQgQvc0pJ9rB8bLwhA4C6BH7CBAATuE0AQpgMCDwggCOMBAQRhBiCwRoAdZI0bUUUIIEiRRlPmGgEEWeNGVBECCFKk0ZS5RgBB1rgRVYQAghRpNGWuEUCQNW5EFSGAIEUaTZlrBBBkjRtRRQggSJFGU+YaAQRZ40ZUEQIIUqTRlLlGAEHWuBFVhACCFGk0Za4RQJA1bkQVIYAgRRpNmWsEEGSNG1FFCCBIkUZT5hoBBFnjRlQRAghSpNGUuUYAQda4EVWEAIIUaTRlrhFAkDVuRBUhgCBFGk2ZawQQZI0bUUUIIEiBRrfW3vYy33rvHwVKPq1EBDkNpb8T7WL83LbtIsh1kp/I8rxnCPKcUcgjWmtjpxhyPHohyRNACBJy/B8nfVCOy0mQ5AFOBMkpyF+TZSHJHWAIMjlJ3g/frzt+LeSJJDegIcjCJHkOmXx79b0UJPlGBEE8T/tCboIdhGsSdpCFiQsWcoIgo2J2kr3v7CDBBDiSbmtt9iL91mmR5J//KRDkyMQFO0Z4HXJdbXlJECTY8B9Nt7U27mTd+gT96Cm4JmEHmZ2VWMcjibxf7CByhq7PgCSy9iCIjF+IaCRZbxOCrLMLFYkka+1CkDVuIaOQZL5tCDLPLHQEksy1D0HmeKU4GkmOtxFBjrNKdSSSHGsnghzjlPIoJHneVgR5zij1EUjyuL0Iknr8jxWHJPc5IcixGUp/FJLcbjGCpB/94wUiyf9ZIcjx+SlxJJL8t80IUmLs54pEkj+8EGRudsocjST/thpByoz8fKFIgiDzU1Msorok7CDFBn6l3MqSIMjKxBSMqSoJghQc9tWSK0qCIKvTUjSumiQIUnTQJWVXkgRBJJNSOLaKJAhSeMilpVeQBEGkU1I8PrskCFJ8wM8oP7MkbgW5enTxGT3kHPoE7j1Nd3ZlVz+Y7UaQq0cWD6Bn/OjybGM43g8BN5K4EOTEn+v302IykRJwIYm5IMghnaPU8eaSeBDkjKchpZ6SysX13k1n1HTxk56nV3l+KtT+3nv/sirUWpCPbdvG3Q9eELhH4Kv3/m6FB0GsyLPuUQIIcpQUx5UkYHqhbr2DjM87xsMmeUHgHoG6ggwiJ35NgRFLSKD0XaxdEHaRhIN9Ukmmu8eowfQt1gXi1ddM+IrJSZOV4DSmt3cv/FwIciXKuO07Xtz6TTDhkyVcPusYu4bZ5x7fc3YlyCRQDoeAOgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJIEjk7pG7OgEEUUfMApEJuBOktfa2A738G5kvuc8R+Oq9f82F6B7tRpDW2se2bT91y+XsQQh89t7HPJi/XAjSWvu1bRs7hvk4uErAhSTmgrBzuBpKb8mYS2IqyH69MXYPXhC4R+Dd8rrEWhCuOxDjGQEEeUaIv5cmMO5svVsRsN5BuDi36nycdU2vQ6wF4S1WnEG1yrS0IOPWLhfpVqMXY9261yCjP9zmjTGlRlma7h6jZtO3WBfofFBoNH7Ol+29m8+neQL7LsJbLefD+uL0TO9cXdfqQhAlSVx96e3FAxZ1uc+RuOUHg9/BuRFEQRLz969Rp5S8/xBwJQiSMJreCLgTBEm8jUjtfFwKgiS1h9JT9W4FQRJPY1I3F9eCIEndwfRSuXtBkMTLqNTMI4QgSFJzOD1UHUYQJPEwLvVyCCUIktQbUOuKwwmCJNYjU2v9kIIgSa0htaw2rCBIYjk2ddYOLQiS1BlUq0rDC4IkVqNTY90UgiBJjWG1qDKNIEhiMT7510wlCJLkH9hXV5hOECR59QjlXi+lIEiSe2hfWV1aQZDklWOUd63UgihIYvorf3nH0G9l6QU5WRI3v9fkd6RyZVZCkJMl4eeEcjnwsJoygpwoCbsIguQlcMZj3zz8ZmzeDvmqrNQOckEvlQRBfA2xZjYlBRG+3eIaRHMinZ27rCACSRDE2RBrplNakAVJuEDXnEaH5y4vyIQkyOFwgLVTQpArwg8eB8fbKu1JdHp+BLnRmP0u1++/eHqYi9MZSp0WgqRuL8VJCSCIlCDxqQkgSOr2UpyUAIJICRKfmgCCpG4vxUkJIIiUIPGpCSBI6vZSnJQAgkgJEp+aAIKkbi/FSQkgiJQg8akJIEjq9lKclACCSAkSn5oAgqRuL8VJCSCIlCDxqQkgSOr2UpyUAIJICRKfmgCCpG4vxUkJIIiUIPGpCSBI6vZSnJQAgkgJEp+aAIKkbi/FSQkgiJQg8akJIEjq9lKclACCSAkSn5oAgqRuL8VJCSCIlCDxqQkgSOr2UpyUAIJICRKfmgCCpG4vxUkJIIiUIPGpCfwNgHnv2EHR6KQAAAAASUVORK5CYII=';
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
        iframe.allow = 'microphone';
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

        const switchBtn = document.createElement('img');
        switchBtn.src = SwitchIcon;
        switchBtn.style.position = 'absolute';
        switchBtn.style.background = 'none';
        switchBtn.style.border = 'none';
        switchBtn.style.cursor = 'pointer';
        switchBtn.id = 'switchBtn';
        switchBtn.style.width = '35px';

        switchBtn.addEventListener('click', function () {
            chrome.storage.local.get(["configs", "chatbotSrc",], function (result) {
                const configs = result.configs || [];
                // 创建或更新列表容器
                let listWrapper = document.getElementById('configList');
                if (listWrapper) {
                    iframeWrapper.removeChild(listWrapper);
                    return;
                }
                listWrapper = document.createElement('div');
                listWrapper.id = 'configList';
                listWrapper.className = 'ant-dropdown-menu';
                listWrapper.style.position = 'absolute';
                listWrapper.style.zIndex = '2147483647';
                listWrapper.style.backgroundColor = '#fff';
                listWrapper.style.border = '1px solid #ccc';
                listWrapper.style.borderRadius = '4px';
                listWrapper.classList.add('ant-dropdown', 'ant-dropdown-placement-bottomRight');
                const switchBtnRect = switchBtn.getBoundingClientRect();
                const iframeWrapperRect = iframeWrapper.getBoundingClientRect();
                const switchBtnOffsetRight =  iframeWrapperRect.right - switchBtnRect.right;
                const switchBtnOffsetTop = switchBtnRect.top - iframeWrapperRect.top;
                // 确保listWrapper存在并调整其位置
                listWrapper.style.right = switchBtnOffsetRight + 'px';
                listWrapper.style.top = (switchBtnOffsetTop + switchBtn.offsetHeight) + 'px';
                listWrapper.style.padding = '5px';
                // 显示所有chatbot名称
                configs.forEach((config) => {
                    const item = document.createElement('div');
                    item.textContent = config.name;
                    item.className = 'ant-dropdown-menu-item'; // 使用 Ant Design 的类名
                    item.style.cursor = 'pointer';
                    item.style.padding = '5px 16px';
                    item.style.borderRadius = '4px';
                    // 设置默认样式
                    item.style.position = 'relative';
                    item.style.lineHeight = '22px';
                    item.style.color = '#606266';
                    item.style.fontSize = '14px';
                    item.style.whiteSpace = 'nowrap';
                    item.style.textAlign = 'left';
                    item.style.boxSizing = 'border-box';
                    item.style.background = '#fff';
                    item.style.borderBottomColor = '#e8eaec';
                    item.style.borderBottomStyle = 'solid';
                    item.style.borderBottomWidth = '1px';

                    // 设置选中样式
                    if (config.url === result.chatbotSrc) {
                        item.style.color = '#1890ff';
                        item.style.fontWeight = 'bold';
                        item.style.background = '#e6f7ff';
                    }

                    // 为每个列表项添加点击事件监听器
                    item.addEventListener('click', function () {
                        // 更新样式，移除其他项的蓝色
                        const items = listWrapper.querySelectorAll('.ant-dropdown-menu-item');
                        items.forEach((i) => {
                            i.style.color = '#606266';
                            i.style.fontWeight = 'normal';
                            i.style.background = '#fff';
                        });
                        // 设置当前项为蓝色
                        item.style.color = '#1890ff';
                        item.style.fontWeight = 'bold';
                        item.style.background = '#e6f7ff';

                        // 更新chatbotSrc的值
                        chrome.storage.local.set({chatbotSrc: config.url}, function () {
                            console.log('Updated chatbotSrc:', config.url);
                        });

                        // 更新iframe的src
                        loadChatBotIframe(document.getElementById(chatWindowWrapperId));
                    });

                    listWrapper.appendChild(item);
                });

                // 将列表容器添加到body中或确保它已经存在
                if (!iframeWrapper.contains(listWrapper)) {
                    iframeWrapper.appendChild(listWrapper);
                }
            });
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
                loadChatBotIframe(chatWindow);
            } else {
                chatWindow.style.visibility = 'hidden';
                const tmpBtn = document.getElementById('fullscreenBtn');
                const tmpBtn1 = document.getElementById('switchBtn');
                const tmpEl = document.getElementById('configList');
                if (tmpBtn) {
                    chatWindow.removeChild(tmpBtn);
                }
                if (tmpBtn1) {
                    chatWindow.removeChild(tmpBtn1);
                }
                if (tmpEl) {
                    chatWindow.removeChild(tmpEl);
                }
                ChatBtnDiv.src = MessageIcon;
            }
        });

        function loadChatBotIframe(chatWindow) {
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
                            switchBtn.style.top = '13px';
                            switchBtn.style.right = '90px';
                        } else {
                            fullscreenBtn.style.top = '6px';
                            fullscreenBtn.style.right = '50px';
                            switchBtn.style.top = '6px';
                            switchBtn.style.right = '80px';
                        }
                        chatWindow.appendChild(fullscreenBtn);
                        chatWindow.appendChild(switchBtn);
                        const tmpEl = document.getElementById('configList');
                        if (tmpEl) {
                            chatWindow.removeChild(tmpEl);
                        }
                    };
                }, 100);
            });
        }

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
                    if (parseInt(iframeWrapper.style.width, 10) >= 900) {
                        fullscreenBtn.style.top = '13px';
                        fullscreenBtn.style.right = '60px';
                        switchBtn.style.top = '13px';
                        switchBtn.style.right = '90px';
                    } else {
                        fullscreenBtn.style.top = '6px';
                        fullscreenBtn.style.right = '50px';
                        switchBtn.style.top = '6px';
                        switchBtn.style.right = '80px';
                    }
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
