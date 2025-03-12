FROM python:3.10-slim AS python_base

ENV VERSION_RELEASE=Debian_bookworm

RUN apt-get clean && apt-get update && apt-get install make g++ tar wget gperf -y

WORKDIR /app

RUN wget https://github.com/seccomp/libseccomp/releases/download/v2.5.5/libseccomp-2.5.5.tar.gz

RUN tar -zxvf libseccomp-2.5.5.tar.gz

RUN cd libseccomp-2.5.5 && ./configure && make V=1 && make install

RUN pip install uvicorn FastAPI Cython -i https://mirrors.aliyun.com/pypi/simple

RUN cd /app/libseccomp-2.5.5/src/python/ && python setup.py install

COPY service.py Dockerfile ./

EXPOSE 9985

ENTRYPOINT python3 service.py
# 本地测试：
# docker build -t pyenv_seccomp:v1.0 .
# docker run -d --pids-limit 30 --cpus=1 -p 9985:9985 pyenv_seccomp:v1.0