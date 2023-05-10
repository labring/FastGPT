# 安装 clash 

clash 会在本机启动代理。对应的，你需要配置项目的两个环境变量：

```
AXIOS_PROXY_HOST=127.0.0.1
AXIOS_PROXY_PORT=7890
```

需要注的是，在你的 config.yaml 文件中，最好仅指定 api.openai.com 走代理，其他请求都直连。

**安装clash**
```bash
# 下载包
curl https://glados.rocks/tools/clash-linux.zip -o clash.zip 
# 解压
unzip clash.zip
# 下载终端配置⽂件（改成自己配置文件路径）
curl https://update.glados-config.com/clash/98980/8f30944/70870/glados-terminal.yaml > config.yaml
# 赋予运行权限
chmod +x ./clash-linux-amd64-v1.10.0 
```

**runClash.sh**
```sh
# 记得配置端口变量：
export ALL_PROXY=socks5://127.0.0.1:7891
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

# 运行脚本: 删除clash - 到 clash 目录 - 删除缓存 - 执行运行. 会生成一个 nohup.out 文件，可以看到 clash 的 logs
OLD_PROCESS=$(pgrep clash)
if [ ! -z "$OLD_PROCESS" ]; then
  echo "Killing old process: $OLD_PROCESS"
  kill $OLD_PROCESS
fi
sleep 2
cd  **/clash
rm -f ./nohup.out || true
rm -f ./cache.db || true
nohup ./clash-linux-amd64-v1.10.0  -d ./ &
echo "Restart clash"
```

**config.yaml配置例子**
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
  - { name: '♻️ 自动选择', type: url-test,  proxies: [香港V01×1.5], url: 'https://api.openai.com', interval: 3600}
rules:
  - 'DOMAIN-SUFFIX,api.openai.com,♻️ 自动选择'
  - 'MATCH,DIRECT'
```