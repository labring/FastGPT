export ALL_PROXY=socks5://127.0.0.1:7891
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890

OLD_PROCESS=$(pgrep clash)
if [ ! -z "$OLD_PROCESS" ]; then
  echo "Killing old process: $OLD_PROCESS"
  kill $OLD_PROCESS
fi
sleep 2

cd  /root/fastgpt/clash/fast
rm -f ./nohup.out || true
rm -f ./cache.db || true
nohup ./clash-linux-amd64-v3  -d ./ &
echo "Restart clash fast"
