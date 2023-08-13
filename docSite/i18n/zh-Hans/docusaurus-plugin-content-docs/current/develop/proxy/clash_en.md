# Installing Clash

Clash is a proxy tool that runs on your local machine. Correspondingly, you need to configure two environment variables for your project:

```
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT=7890
```

It's worth noting that in your `config.yaml` file, it's recommended to specify that only requests to `api.openai.com` should go through the proxy, while other requests should go directly.

**Installing Clash**
```bash
# Download the package
curl https://glados.rocks/tools/clash-linux.zip -o clash.zip
# Unzip
unzip clash.zip
# Download the terminal configuration file (change the path to your configuration file)
curl https://update.glados-config.com/clash/98980/8f30944/70870/glados-terminal.yaml > config.yaml
# Grant execute permission
chmod +x ./clash-linux-amd64-v1.10.0
```

**runClash.sh**
```sh
# Remember to configure port variables:
export ALL_PROXY=socks5://127.0.0.1:7891
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

# Run the script: kill Clash if it's already running - navigate to the Clash directory - remove the cache - execute the run command. This will generate a nohup.out file where you can see Clash's logs.
OLD_PROCESS=$(pgrep clash)
if [ ! -z "$OLD_PROCESS" ]; then
  echo "Killing old process: $OLD_PROCESS"
  kill $OLD_PROCESS
fi
sleep 2
cd **/clash
rm -f ./nohup.out || true
rm -f ./cache.db || true
nohup ./clash-linux-amd64-v1.10.0  -d ./ &
echo "Restart clash"
```

**Example config.yaml Configuration**
```yaml
mixed-port: 7890
allow-lan: false
bind-address: '*'
mode: rule
log-level: warning
dns:  
  enable: true  
  ipv6: false  
  nameserver:  
    - 8.8.8.8
    - 8.8.4.4 
  cache-size: 400
proxies:
    - 
proxy-groups:
  - { name: '♻️ Auto-select', type: url-test,  proxies: [Hong Kong V01×1.5], url: 'https://api.openai.com', interval: 3600}
rules:
  - 'DOMAIN-SUFFIX,api.openai.com,♻️ Auto-select'
  - 'MATCH,DIRECT'
```