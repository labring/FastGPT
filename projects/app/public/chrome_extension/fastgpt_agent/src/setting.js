let chatbotSrc = '';
let configs = [];

document.addEventListener('DOMContentLoaded', async function () {
    const storageData = await chrome.storage.local.get(["chatbotSrc", "configs", "showChatBot", "chatBotWidth", "chatBotHeight"]);
    chatbotSrc = storageData.chatbotSrc || '';
    configs = storageData.configs || [];
    const showChatBot = storageData.showChatBot === undefined ? true : storageData.showChatBot;
    const chatBotWidth = storageData.chatBotWidth || 400;
    const chatBotHeight = storageData.chatBotHeight || 700;

    await loadConfigs(configs, chatbotSrc);

    document.getElementById('addConfigButton').addEventListener('click', handleAddButtonClick);
    document.getElementById('startChatButton').addEventListener('click', () => window.location.href = 'popup.html');

    // 监听开关和输入框变化事件
    const showChatBotSwitch = document.getElementById('showChatBotSwitch');
    const chatBotWidthInput = document.getElementById('chatBotWidthInput');
    const chatBotHeightInput = document.getElementById('chatBotHeightInput');

    showChatBotSwitch.addEventListener('change', () => handleShowChatBotChange(showChatBotSwitch.checked));
    chatBotWidthInput.addEventListener('change', () => handleChatBotWidthChange(chatBotWidthInput.value));
    chatBotHeightInput.addEventListener('change', () => handleChatBotHeightChange(chatBotHeightInput.value));

    // 初始化开关和输入框的值
    showChatBotSwitch.checked = showChatBot;
    chatBotWidthInput.value = chatBotWidth;
    chatBotHeightInput.value = chatBotHeight;

});

async function loadConfigs(configs, chatbotSrc) {
    const configList = document.getElementById('configList');
    configList.innerHTML = '';
    configs.forEach(config => {
        const row = createConfigRow(config, chatbotSrc);
        configList.appendChild(row);
    });
}

function createConfigRow(config, chatbotSrc) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${config.name}</td>
        <td>${config.url}</td>
        <td>
            <button type="button" class="editButton">编辑</button>
            <span>|</span>
            <button type="button" class="deleteButton">删除</button>
        </td>
        <td>
            <label class="custom-radio">
                <input type="radio" name="selectBot" class="selectBot" ${config.url === chatbotSrc ? 'checked' : ''}>
                <span class="radio-mark"></span>
            </label>
        </td>
    `;
    row.querySelector('.editButton').addEventListener('click', () => handleEditButtonClick(row, config));
    row.querySelector('.deleteButton').addEventListener('click', () => handleDeleteButtonClick(row, config));
    row.querySelector('.selectBot').addEventListener('change', () => handleSelectBotChange(config.url));
    return row;
}


async function handleDeleteButtonClick(row, config) {
    const configList = document.getElementById('configList');
    const index = Array.from(configList.children).indexOf(row);
    const selectedUrl = config.url;
    if (selectedUrl === chatbotSrc) {
        chatbotSrc = 'about:blank';
        await updateStorage('chatbotSrc', chatbotSrc);
        await updateStorage('chatId', '');
        await updateStorage('shareId', '');
    }
    configs.splice(index, 1);
    await updateStorage('configs', configs);
    row.remove();
}

async function handleSelectBotChange(url) {
    chatbotSrc = url;
    await updateStorage('chatbotSrc', chatbotSrc);
    updateSelectedRadioButton();
}

function updateSelectedRadioButton() {
    document.querySelectorAll('.selectBot').forEach(radio => {
        if (radio.closest('tr').querySelector('td:nth-child(2)').textContent === chatbotSrc) {
            radio.checked = true;
        } else {
            radio.checked = false;
        }
    });
}


function showError(message) {
    const errorMsg = document.getElementById('errorMsg');
    errorMsg.textContent = message;
    errorMsg.style.opacity = 1; // 显示错误消息

    // 设置一个定时器，在5秒后隐藏错误消息
    setTimeout(() => {
        errorMsg.style.opacity = 0; // 隐藏错误消息
    }, 3000);
}


async function updateStorage(key, value) {
    try {
        await chrome.storage.local.set({[key]: value});
        console.log(`${key} 已更新: ${value}`);
    } catch (error) {
        console.error(`更新 ${key} 出错:`, error);
    }
}

function showEditControls(row, isNewConfig = false, config = null) {
    const nameCell = row.querySelector('td:nth-child(1)');
    const urlCell = row.querySelector('td:nth-child(2)');
    const name = isNewConfig ? '' : config.name;
    const url = isNewConfig ? '' : config.url;

    nameCell.innerHTML = `<input type="text" class="editName" value="${name}">`;
    urlCell.innerHTML = `<input type="text" class="editUrl" value="${url}">`;

    const iconContainer = document.createElement('div');
    iconContainer.style.display = 'flex';
    iconContainer.style.flexDirection = 'column';
    iconContainer.style.position = 'absolute';
    iconContainer.style.top = '15px';
    iconContainer.style.left = '-5px';

    const confirmIcon = document.createElement('span');
    confirmIcon.textContent = '√';
    confirmIcon.style.color = 'green';
    confirmIcon.style.cursor = 'pointer';
    confirmIcon.style.margin = '0 0 10px 0';
    confirmIcon.classList.add('icon-hover');
    confirmIcon.classList.add('confirmButton');
    confirmIcon.addEventListener('click', () => {
        handleConfirmButtonClick(row, isNewConfig);
    });

    const cancelIcon = document.createElement('span');
    cancelIcon.textContent = 'X';
    cancelIcon.style.color = 'red';
    cancelIcon.style.cursor = 'pointer';
    cancelIcon.classList.add('icon-hover');
    cancelIcon.classList.add('cancelButton')
    cancelIcon.addEventListener('click', () => {
        handleCancelButtonClick(row, isNewConfig);
    });

    iconContainer.appendChild(confirmIcon);
    iconContainer.appendChild(cancelIcon);

    const cell = row.querySelector('td:nth-child(3)');
    cell.insertBefore(iconContainer, cell.firstChild);
}

function handleAddButtonClick() {
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
        <td></td>
        <td></td>
        <td>
        </td>
        <td>
        </td>
    `;
    document.getElementById('configList').appendChild(newRow);
    showEditControls(newRow, true);
}

function handleEditButtonClick(row, config) {
    disableAllEditButtons();
    showEditControls(row, false, config);
}

function isConfigUnique(name, url, index) {
    return !configs.some((config, i) =>
        i !== index && (config.name === name || config.url === url)
    );
}

function checkConfig(name, url, index) {
    let errorMsg = '';
    if (!name || !url) {
        errorMsg = '名称和地址都是必填项。';
    } else if (!isConfigUnique(name, url, index)) {
        errorMsg = '名称或地址不能重复。';
    }
    return errorMsg;
}

function handleConfirmButtonClick(row, isNewConfig = false) {
    const name = row.querySelector('.editName').value;
    const url = row.querySelector('.editUrl').value;
    const index = isNewConfig ? -1 : Array.from(document.getElementById('configList').children).indexOf(row);
    const errorMsg = checkConfig(name, url, index);
    if (errorMsg) {
        showError(errorMsg);
        return;
    }

    if (isNewConfig) {
        const newConfig = {name, url};
        configs.push(newConfig);
        updateStorage('configs', configs);

    } else {
        const config = configs[index];
        config.name = name;
        if (config.url === chatbotSrc) {
            chatbotSrc = url;
            updateStorage('chatId', '');
            updateStorage('shareId', '');
            chrome.runtime.sendMessage({
                action: "startRequestInterception",
                chatbotSrc: chatbotSrc
            });
        }
        config.url = url;
        updateStorage('configs', configs);
        updateStorage('chatbotSrc', chatbotSrc);
    }
    loadConfigs(configs, chatbotSrc);
    row.remove();
    enableAllEditButtons();
}


function handleCancelButtonClick(row, isNewConfig = false) {
    if (isNewConfig) {
        row.remove();
    } else {
        const index = Array.from(document.getElementById('configList').children).indexOf(row);
        const config = configs[index];
        row.querySelector('td:nth-child(1)').textContent = config.name;
        row.querySelector('td:nth-child(2)').textContent = config.url;
        row.querySelector('.editButton').disabled = false;
        // 移除编辑模式下的确认和取消按钮
        const iconContainer = row.querySelector('td:nth-child(3) > div');
        if (iconContainer) {
            iconContainer.remove();
        }
    }
    enableAllEditButtons();
}

async function handleShowChatBotChange(showChatBot) {
    await updateStorage('showChatBot', showChatBot);
}

async function handleChatBotWidthChange(width) {
    const parsedWidth = parseInt(width);
    if (!isNaN(parsedWidth)) {
        await updateStorage('chatBotWidth', parsedWidth);
    }
}

async function handleChatBotHeightChange(height) {
    const parsedHeight = parseInt(height);
    if (!isNaN(parsedHeight)) {
        await updateStorage('chatBotHeight', parsedHeight);
    }
}

function disableAllEditButtons() {
    const allEditButtons = document.querySelectorAll('.editButton');
    allEditButtons.forEach(button => {
        button.disabled = true;
    });
}

function enableAllEditButtons() {
    const allEditButtons = document.querySelectorAll('.editButton');
    allEditButtons.forEach(button => {
        button.disabled = false;
    });
}