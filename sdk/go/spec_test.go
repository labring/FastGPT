package fastgpt

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"
)

func TestVersionConstants(t *testing.T) {
	if Version != "0.1.0-beta.1" {
		t.Fatalf("Version = %q, want %q", Version, "0.1.0-beta.1")
	}
	if ClientHeaderValue != "fastgpt-go-sdk/0.1.0-beta.1" {
		t.Fatalf("ClientHeaderValue = %q, want %q", ClientHeaderValue, "fastgpt-go-sdk/0.1.0-beta.1")
	}
}

func TestIdentityAndAuthProxyConstructors(t *testing.T) {
	byTmb := AuthProxyByTmbID("tmb_123")
	rawTmb, err := json.Marshal(byTmb)
	if err != nil {
		t.Fatalf("json.Marshal(byTmb) error = %v", err)
	}
	if string(rawTmb) != `{"tmbId":"tmb_123"}` {
		t.Fatalf("byTmb json = %s, want %s", rawTmb, `{"tmbId":"tmb_123"}`)
	}

	byUser := AuthProxyByUsername("alice")
	rawUser, err := json.Marshal(byUser)
	if err != nil {
		t.Fatalf("json.Marshal(byUser) error = %v", err)
	}
	if string(rawUser) != `{"username":"alice"}` {
		t.Fatalf("byUser json = %s, want %s", rawUser, `{"username":"alice"}`)
	}

	idUID := IdentityCustomUID("user_42")
	if idUID.CustomUID != "user_42" || idUID.AuthProxy != nil {
		t.Fatalf("IdentityCustomUID() = %+v, want CustomUID=user_42 AuthProxy=nil", idUID)
	}

	idProxy := IdentityAuthProxy(byTmb)
	byTmb.TmbID = "mutated"
	if idProxy.CustomUID != "" || idProxy.AuthProxy == nil || idProxy.AuthProxy.TmbID != "tmb_123" {
		t.Fatalf("IdentityAuthProxy() = %+v, want copied tmb_123", idProxy)
	}
}

func TestHooksWithTestContext(t *testing.T) {
	ctx := t.Context()

	var (
		gotReq  RequestHookContext
		gotResp ResponseHookContext
		gotErr  ErrorHookContext
	)
	sentinelErr := errors.New("boom")

	hooks := Hooks{
		OnRequest: func(c context.Context, r RequestHookContext) {
			if c != ctx {
				t.Errorf("OnRequest context mismatch")
			}
			gotReq = r
		},
		OnResponse: func(c context.Context, r ResponseHookContext) {
			if c != ctx {
				t.Errorf("OnResponse context mismatch")
			}
			gotResp = r
		},
		OnError: func(c context.Context, r ErrorHookContext) {
			if c != ctx {
				t.Errorf("OnError context mismatch")
			}
			gotErr = r
		},
	}

	headers := http.Header{"X-Test": []string{"1"}}
	hooks.OnRequest(ctx, RequestHookContext{
		OperationID: "chat.completionsV2",
		Method:      http.MethodPost,
		URL:         "https://example.com/api/v2/chat/completions",
		Headers:     headers,
		Attempt:     0,
	})
	hooks.OnResponse(ctx, ResponseHookContext{
		OperationID: "chat.completionsV2",
		Method:      http.MethodPost,
		URL:         "https://example.com/api/v2/chat/completions",
		StatusCode:  http.StatusOK,
		RequestID:   "req_1",
		Duration:    15 * time.Millisecond,
		Attempt:     0,
	})
	hooks.OnError(ctx, ErrorHookContext{
		OperationID: "chat.completionsV2",
		Method:      http.MethodPost,
		URL:         "https://example.com/api/v2/chat/completions",
		Duration:    5 * time.Millisecond,
		Attempt:     1,
		Error:       sentinelErr,
	})

	if gotReq.OperationID != "chat.completionsV2" || gotReq.Headers.Get("X-Test") != "1" {
		t.Fatalf("unexpected RequestHookContext: %+v", gotReq)
	}
	if gotResp.StatusCode != http.StatusOK || gotResp.RequestID != "req_1" {
		t.Fatalf("unexpected ResponseHookContext: %+v", gotResp)
	}
	if !errors.Is(gotErr.Error, sentinelErr) || gotErr.Attempt != 1 {
		t.Fatalf("unexpected ErrorHookContext: %+v", gotErr)
	}
}
