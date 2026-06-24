package main

// FastGPT Python native sandbox.
//
// This package is project-local FastGPT glue code, not copied from Dify or any
// other sandbox project. It exposes a tiny C ABI for python-bootstrap.py and
// relies on the open-source github.com/seccomp/libseccomp-golang and
// golang.org/x/sys packages for Linux seccomp/prctl/syscall bindings.

/*
#include <stdlib.h>
*/
import "C"

import (
	"sync"
	"unsafe"

	"fastgpt-python-sandbox/internal/sandbox"
)

var (
	lastErrMu sync.Mutex
	lastErr   string
)

func setLastErr(err error) {
	lastErrMu.Lock()
	defer lastErrMu.Unlock()
	if err == nil {
		lastErr = ""
		return
	}
	lastErr = err.Error()
}

//export FastGPTInitPythonSandbox
func FastGPTInitPythonSandbox(uid C.int, gid C.int, enableNetwork C.int) C.int {
	err := sandbox.Init(int(uid), int(gid), enableNetwork != 0)
	setLastErr(err)
	if err != nil {
		return 1
	}
	return 0
}

//export FastGPTLastError
func FastGPTLastError() *C.char {
	lastErrMu.Lock()
	defer lastErrMu.Unlock()
	return C.CString(lastErr)
}

//export FastGPTFreeCString
func FastGPTFreeCString(value *C.char) {
	C.free(unsafe.Pointer(value))
}

func main() {}
