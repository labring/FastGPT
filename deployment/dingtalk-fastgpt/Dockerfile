FROM python:3.12-slim

ARG UPSTREAM_REF=17fc067e37cea8df01368671a387f77e168d3e08

WORKDIR /app

# Fetch only the two required files; the upstream repository also tracks an .env file.
RUN python -c 'import base64,json,os,urllib.request,pathlib; base="https://api.github.com/repos/peter17919/fastgpt-dingtalk/contents/"; root=pathlib.Path("/app"); [(root/name).write_bytes(base64.b64decode(json.load(urllib.request.urlopen(urllib.request.Request(base+name+"?ref="+os.environ["UPSTREAM_REF"],headers={"Accept":"application/vnd.github+json","User-Agent":"fastgpt-dingtalk-build"}))) ["content"])) for name in ("dingtalk_fastgpt.py","requirements.txt")]'
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir 'markdown-it-py>=3,<5'

COPY bridge.py /app/bridge.py
COPY command_state.py /app/command_state.py
COPY test_bridge.py /app/test_bridge.py

ENV PYTHONUNBUFFERED=1

CMD ["python", "bridge.py"]
