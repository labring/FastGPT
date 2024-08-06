document.addEventListener('DOMContentLoaded', function () {
    const chatbotIframe = document.getElementById('chatbot-iframe');
    const fullScreenBtn = document.getElementById('fullScreen');
    const configBtn = document.getElementById('config-btn');
    const overlay = document.getElementById('configOverlay');
    configBtn.addEventListener('click', function () {
        window.location.href = 'setting.html'
    });

    // 监听 chatbotIframe 加载完成事件
    chatbotIframe.addEventListener('load', function() {
        // 当 iframe 加载完成后显示按钮
        fullScreenBtn.style.display = 'inline-block';
        configBtn.style.display = 'inline-block';
    });
    chrome.storage.local.get(["chatbotSrc", "shareId", "chatId", "fastUID"]).then((result) => {
        const botSrc = result.chatbotSrc;
        let fastUID = result.fastUID;
        if (!fastUID || fastUID === '') {
            fastUID = generateUUID();
            chrome.storage.local.set({
                fastUID: fastUID
            });
        }
        console.log('fastUID is', fastUID);
        console.log("chatbotSrc is " + botSrc);
        console.log("shareId is " + result.shareId);
        console.log("chatId is " + result.chatId);
        chatbotIframe.src = result.chatbotSrc + "&authToken=" + fastUID;
        if (!botSrc || botSrc === 'about:blank' || botSrc === '') {
            overlay.style.display = 'flex';
        } else {
            if (botSrc.includes(result.shareId)) {
                chatbotIframe.src = chatbotIframe.src + "&chatId=" + result.chatId;
                console.log('chatbotIframe.src', chatbotIframe.src);
            }
            overlay.style.display = 'none';
            chrome.runtime.sendMessage({
                action: "startRequestInterception",
                chatbotSrc: botSrc
            });
        }
    });

    fullScreenBtn.addEventListener('click', function () {
        const iframe = document.getElementById('chatbot-iframe');
        if (iframe) {
            const iframeSrc = iframe.src;
            console.log('fullScreenSrc', iframeSrc)
            chrome.tabs.create({url: iframeSrc});
        }
    });
});

function generateUUID() {
    const randomString = 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
        const randomHex = (Math.random() * 16) | 0;
        return randomHex.toString(16);
    });

    const timestamp = Date.now().toString(16);

    const extraRandom = (Math.random() * 1e16).toString(16);

    return `${randomString}-${timestamp}-${extraRandom}`;
}
