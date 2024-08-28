let requestInterceptor = null;

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === "startRequestInterception") {
        const botSrc = message.chatbotSrc;
        console.log("src", botSrc);
        const urlObj = new URL(botSrc);
        const domain = urlObj.host;
        const searchParams = urlObj.searchParams;
        const frameShareId = searchParams.get('shareId') || '';
        let frameChatId = searchParams.get('chatId') || '';

        // 移除已有的拦截器（如果存在）
        if (requestInterceptor) {
            chrome.webRequest.onBeforeRequest.removeListener(requestInterceptor);
        }

        requestInterceptor = function (details) {
            if (details.frameId !== -1
                && details.url.includes(domain)
                && details.url.includes("chat/completions")) {
                console.log("Intercepted request from chatbot-iframe:", details);
                if (details.requestBody.raw) {
                    let decoder = new TextDecoder("utf-8");
                    let postData = decoder.decode(new Uint8Array(details.requestBody.raw[0].bytes));
                    try {
                        let postDataObj = JSON.parse(postData);
                        let shareId = postDataObj.shareId;
                        let chatId = postDataObj.chatId;

                        if (frameChatId !== chatId && frameShareId === shareId) {
                            chrome.storage.local.set({["shareId"]: shareId});
                            chrome.storage.local.set({["chatId"]: chatId});
                            frameChatId = chatId;
                            console.log(`Stored shareId: ${shareId} and chatId: ${chatId} to localStorage.`);
                        }
                    } catch (error) {
                        console.error("Error parsing postData:", error);
                    }
                }
            }
            return {};
        };

        chrome.webRequest.onBeforeRequest.addListener(
            requestInterceptor,
            { urls: ["<all_urls>"] },
            ["requestBody"]
        );
    }
});
