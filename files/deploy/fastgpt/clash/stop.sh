export ALL_PROXY=''
export http_proxy=''
export https_proxy=''
export HTTP_PROXY=''
export HTTPS_PROXY=''
OLD_PROCESS=$(pgrep clash)
if [ ! -z "$OLD_PROCESS" ]; then
  echo "Killing old process: $OLD_PROCESS"
  kill $OLD_PROCESS
fi
