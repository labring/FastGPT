#!/bin/bash

temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT

syscall_table_file="$temp_dir/syscall_table.txt"
code_file="$temp_dir/test_code.py"
strace_log="$temp_dir/strace.log"
syscalls_file="$temp_dir/syscalls.txt"

code='
import pandas as pd
def main():
    data = {"Name": ["Alice", "Bob"], "Age": [25, 30]}
    df = pd.DataFrame(data)
    return {
        "head": df.head().to_dict()
    }
'

if ! ausyscall --dump > "$syscall_table_file" 2>/dev/null; then
    grep -E '^#define __NR_' /usr/include/asm/unistd_64.h | \
        sed 's/#define __NR_//;s/[ \t]\+/ /g' | \
        awk '{print $1, $2}' > "$syscall_table_file"
fi

echo "$code" > "$code_file"

strace -ff -e trace=all -o "$strace_log" python3 "$code_file" >/dev/null 2>&1

cat "$strace_log"* 2>/dev/null | grep -oE '^[[:alnum:]_]+' | sort -u > "$syscalls_file"

allowed_syscalls=()
while read raw_name; do
    go_name=$(echo "$raw_name" | tr 'a-z' 'A-Z' | sed 's/-/_/g')
    allowed_syscalls+=("\"syscall.SYS_${go_name}\"")
done < "$syscalls_file"

echo "allowed_syscalls = ["
printf '    %s,\n' "${allowed_syscalls[@]}" | paste -sd '    \n'
echo "]"