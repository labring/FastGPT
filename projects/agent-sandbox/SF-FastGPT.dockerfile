FROM labring/fastgpt-agent-sandbox:v0.1
COPY --chown=sandbox:sandbox sf-fastgpt-settings.json /home/sandbox/.local/share/code-server/User/settings.json