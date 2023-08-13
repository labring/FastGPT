# Quick Deployment of OneAPI with Sealos

Deploy and use without any magic!

## SqlLite Version

The SqlLite version is suitable for personal use with low concurrency.

## Step 1: [Open Sealos Public Cloud](https://cloud.sealos.io/)

## Step 2: Open the App Launchpad Tool

![step1](./imgs/step1.png)

## Step 3: Create a New Application

## Step 4: Fill in the Parameters

Image: `ghcr.io/songquanpeng/one-api:latest`

![step2](./imgs/step2.png)

Turn on the "Open External Access" switch. Sealos will automatically assign an accessible address, so you don't need to configure it yourself.

![step3](./imgs/step3.png)

After filling in the parameters, click "Deploy" in the upper-right corner.

## Step 5: Access the Application

Click on the external access address provided by Sealos to access the OneAPI project.

![step4](./imgs/step4.png)
![step5](./imgs/step5.png)

## Step 6: Update FastGpt Environment Variables

Replace the environment variables in FastGpt with the following values:

```
# The address below is provided by Sealos, make sure to include 'v1'
OPENAI_BASE_URL=https://xxxx.cloud.sealos.io/v1
# The key below is provided by OneAPI
CHAT_API_KEY=sk-xxxxxx
```

## MySQL Version

For high traffic scenarios, it is recommended to use the MySQL version, which supports multi-instance scaling.

Click the button below to deploy with a single click:

[![](https://raw.githubusercontent.com/labring-actions/templates/main/Deploy-on-Sealos.svg)](https://cloud.sealos.io/?openapp=system-fastdeploy%3FtemplateName%3Done-api)

After deployment, you will be redirected to the "Application Management" page. The database is in another application. You need to wait 1~3 minutes for the database to be operational before you can access it successfully.