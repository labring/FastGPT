# Integrating Third-Party Applications via OpenAPI

## 1. Obtaining an API Key

Note: Copy the key and close it after copying.

![Image](./img1.png)

## 2. Combining the Keys

Combine the copied API key with the AppId to create a new key in the format: API Key-AppId. For example: `fastgpt-z51pkjqm9nrk03a1rx2funoy-642adec15f04d67d4613efdb`

## 3. Replacing Variables in the Third-Party Application

Set the following variables in your third-party application:

- `OPENAI_API_BASE_URL`: Change this to your deployed domain, for example: `https://fastgpt.run/api/openapi`
- `OPENAI_API_KEY`: Set it to the combined key obtained in the previous step

**Example with [ChatGPT Next](https://github.com/Yidadaa/ChatGPT-Next-Web):**
![Image](./chatgptnext.png)

**Example with [ChatGPT Web](https://github.com/Chanzhaoyu/chatgpt-web):**
![Image](./chatgptweb.png)