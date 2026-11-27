package fastgpt

import (
	"context"
	"encoding/json"
	"maps"
	"slices"
)

// InteractiveType identifies a workflow human-in-the-loop pause payload variant.
type InteractiveType string

const (
	InteractiveTypeUserSelect              InteractiveType = "userSelect"
	InteractiveTypeUserInput               InteractiveType = "userInput"
	InteractiveTypePaymentPause            InteractiveType = "paymentPause"
	InteractiveTypeChildrenInteractive     InteractiveType = "childrenInteractive"
	InteractiveTypeToolChildrenInteractive InteractiveType = "toolChildrenInteractive"
	InteractiveTypeLoopInteractive         InteractiveType = "loopInteractive"
	InteractiveTypeLoopRunInteractive      InteractiveType = "loopRunInteractive"
	InteractiveTypeUnknown                 InteractiveType = "unknown"
)

// UserSelectInteractiveOption describes a single selectable choice in a userSelect prompt.
type UserSelectInteractiveOption struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// UserSelectInteractiveParams holds validated parameters for a userSelect pause.
type UserSelectInteractiveParams struct {
	Description       string                        `json:"description,omitempty"`
	UserSelectOptions []UserSelectInteractiveOption `json:"userSelectOptions"`
	UserSelectedVal   string                        `json:"userSelectedVal,omitempty"`
}

// UserInputInteractiveParams holds validated parameters for a userInput form pause.
type UserInputInteractiveParams struct {
	Description string           `json:"description,omitempty"`
	InputForm   []map[string]any `json:"inputForm"`
	Submitted   *bool            `json:"submitted,omitzero"`
}

// PaymentPauseInteractiveParams holds validated parameters for a paymentPause node.
type PaymentPauseInteractiveParams struct {
	Description string `json:"description,omitempty"`
	Continue    *bool  `json:"continue,omitzero"`
}

// NestedInteractiveParams holds validated wrapper parameters for nested sub-workflow or loop pauses.
type NestedInteractiveParams struct {
	ChildrenResponse *InteractivePayload `json:"childrenResponse"`
	Extra            map[string]any      `json:"-"`
}

// InteractivePayload represents a normalized FastGPT workflow interactive pause payload.
// Known variants populate UserSelect, UserInput, PaymentPause, or Nested; unrecognized or
// malformed payloads degrade cleanly to Type == InteractiveTypeUnknown with RawType and Raw preserved.
type InteractivePayload struct {
	Type         InteractiveType                `json:"type"`
	RawType      string                         `json:"rawType,omitempty"`
	UserSelect   *UserSelectInteractiveParams   `json:"-"`
	UserInput    *UserInputInteractiveParams    `json:"-"`
	PaymentPause *PaymentPauseInteractiveParams `json:"-"`
	Nested       *NestedInteractiveParams       `json:"-"`
	Params       map[string]any                 `json:"params,omitempty"`
	Raw          map[string]any                 `json:"raw,omitempty"`
}

// InteractiveUserMessage aliases ChatUserMessage for workflow recovery replies.
type InteractiveUserMessage = ChatUserMessage

// ReplyUserSelectParams holds parameters for resuming a userSelect workflow pause.
type ReplyUserSelectParams struct {
	AppID               Opt[string]
	ChatID              string
	Value               string
	Metadata            Opt[map[string]any]
	Variables           Opt[map[string]any]
	ResponseChatItemID  Opt[string]
	Detail              Opt[bool]
	RetainDatasetCite   Opt[bool]
	ShowSkillReferences Opt[bool]
	CustomUID           Opt[string]
	AuthProxy           Opt[AuthProxy]
}

// ReplyUserFormParams holds parameters for resuming a userInput form workflow pause.
type ReplyUserFormParams struct {
	AppID               Opt[string]
	ChatID              string
	Values              map[string]any
	Metadata            Opt[map[string]any]
	Variables           Opt[map[string]any]
	ResponseChatItemID  Opt[string]
	Detail              Opt[bool]
	RetainDatasetCite   Opt[bool]
	ShowSkillReferences Opt[bool]
	CustomUID           Opt[string]
	AuthProxy           Opt[AuthProxy]
}

// UnmarshalJSON parses and normalizes a raw JSON interactive payload.
func (p *InteractivePayload) UnmarshalJSON(data []byte) error {
	var raw any
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	parsed := parseInteractivePayload(raw, 12)
	if parsed == nil {
		*p = InteractivePayload{}
		return nil
	}
	*p = *parsed
	return nil
}

// MarshalJSON serializes the interactive payload back into FastGPT's wire JSON shape.
func (p InteractivePayload) MarshalJSON() ([]byte, error) {
	if p.Type == InteractiveTypeUnknown && len(p.Raw) > 0 {
		return json.Marshal(p.Raw)
	}
	wire := map[string]any{
		"type": p.Type,
	}
	if p.Type == InteractiveTypeUnknown && p.RawType != "" {
		wire["rawType"] = p.RawType
	}
	switch p.Type {
	case InteractiveTypeUserSelect:
		if p.UserSelect != nil {
			wire["params"] = p.UserSelect
		}
	case InteractiveTypeUserInput:
		if p.UserInput != nil {
			wire["params"] = p.UserInput
		}
	case InteractiveTypePaymentPause:
		if p.PaymentPause != nil {
			wire["params"] = p.PaymentPause
		}
	case InteractiveTypeChildrenInteractive,
		InteractiveTypeToolChildrenInteractive,
		InteractiveTypeLoopInteractive,
		InteractiveTypeLoopRunInteractive:
		if p.Params != nil {
			paramsMap := maps.Clone(p.Params)
			if p.Nested != nil && p.Nested.ChildrenResponse != nil {
				paramsMap["childrenResponse"] = p.Nested.ChildrenResponse
			}
			wire["params"] = paramsMap
		} else if p.Nested != nil {
			wire["params"] = map[string]any{"childrenResponse": p.Nested.ChildrenResponse}
		}
	default:
		if p.Params != nil {
			wire["params"] = p.Params
		}
	}
	return json.Marshal(wire)
}

func isNestedInteractiveType(t string) bool {
	switch InteractiveType(t) {
	case InteractiveTypeChildrenInteractive,
		InteractiveTypeToolChildrenInteractive,
		InteractiveTypeLoopInteractive,
		InteractiveTypeLoopRunInteractive:
		return true
	default:
		return false
	}
}

func toStringAnyMap(val any) (map[string]any, bool) {
	if val == nil {
		return nil, false
	}
	if m, ok := val.(map[string]any); ok && m != nil {
		return m, true
	}
	return nil, false
}

func parseUserSelectOptions(raw any) ([]UserSelectInteractiveOption, bool) {
	slice, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	out := make([]UserSelectInteractiveOption, 0, len(slice))
	for _, item := range slice {
		m, ok := toStringAnyMap(item)
		if !ok {
			return nil, false
		}
		key, keyOK := m["key"].(string)
		val, valOK := m["value"].(string)
		if !keyOK || !valOK {
			return nil, false
		}
		out = append(out, UserSelectInteractiveOption{Key: key, Value: val})
	}
	return out, true
}

func parseInputFormList(raw any) ([]map[string]any, bool) {
	slice, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	out := make([]map[string]any, 0, len(slice))
	for _, item := range slice {
		m, ok := toStringAnyMap(item)
		if !ok {
			return nil, false
		}
		out = append(out, maps.Clone(m))
	}
	return out, true
}

func parseInteractivePayload(val any, maxDepth int) *InteractivePayload {
	if maxDepth < 0 {
		return nil
	}
	if existing, ok := val.(*InteractivePayload); ok {
		if existing == nil {
			return nil
		}
		copied := *existing
		return &copied
	}
	if existing, ok := val.(InteractivePayload); ok {
		if existing.Type == "" {
			return nil
		}
		copied := existing
		return &copied
	}

	m, ok := toStringAnyMap(val)
	if !ok {
		return nil
	}
	typeName, ok := m["type"].(string)
	if !ok || typeName == "" {
		return nil
	}

	rawParams, hasParams := toStringAnyMap(m["params"])

	if typeName == string(InteractiveTypeUserSelect) && hasParams {
		if options, valid := parseUserSelectOptions(rawParams["userSelectOptions"]); valid {
			params := &UserSelectInteractiveParams{
				UserSelectOptions: options,
			}
			if desc, ok := rawParams["description"].(string); ok {
				params.Description = desc
			}
			if selected, ok := rawParams["userSelectedVal"].(string); ok {
				params.UserSelectedVal = selected
			}
			return &InteractivePayload{
				Type:       InteractiveTypeUserSelect,
				UserSelect: params,
				Params:     maps.Clone(rawParams),
			}
		}
	}

	if typeName == string(InteractiveTypeUserInput) && hasParams {
		if form, valid := parseInputFormList(rawParams["inputForm"]); valid {
			params := &UserInputInteractiveParams{
				InputForm: form,
			}
			if desc, ok := rawParams["description"].(string); ok {
				params.Description = desc
			}
			if submitted, ok := rawParams["submitted"].(bool); ok {
				params.Submitted = &submitted
			}
			return &InteractivePayload{
				Type:      InteractiveTypeUserInput,
				UserInput: params,
				Params:    maps.Clone(rawParams),
			}
		}
	}

	if typeName == string(InteractiveTypePaymentPause) && hasParams {
		params := &PaymentPauseInteractiveParams{}
		if desc, ok := rawParams["description"].(string); ok {
			params.Description = desc
		}
		if cont, ok := rawParams["continue"].(bool); ok {
			params.Continue = &cont
		}
		return &InteractivePayload{
			Type:         InteractiveTypePaymentPause,
			PaymentPause: params,
			Params:       maps.Clone(rawParams),
		}
	}

	if isNestedInteractiveType(typeName) && hasParams {
		if child := parseInteractivePayload(rawParams["childrenResponse"], maxDepth-1); child != nil {
			paramsCopy := maps.Clone(rawParams)
			return &InteractivePayload{
				Type: InteractiveType(typeName),
				Nested: &NestedInteractiveParams{
					ChildrenResponse: child,
					Extra:            paramsCopy,
				},
				Params: paramsCopy,
			}
		}
	}

	if typeName == string(InteractiveTypeUnknown) {
		if rawType, ok := m["rawType"].(string); ok {
			if rawMap, ok := toStringAnyMap(m["raw"]); ok {
				return &InteractivePayload{
					Type:    InteractiveTypeUnknown,
					RawType: rawType,
					Params:  maps.Clone(rawParams),
					Raw:     maps.Clone(rawMap),
				}
			}
		}
	}

	return &InteractivePayload{
		Type:    InteractiveTypeUnknown,
		RawType: typeName,
		Params:  maps.Clone(rawParams),
		Raw:     maps.Clone(m),
	}
}

// IsUserSelectInteractive reports whether payload is a validated userSelect prompt.
func IsUserSelectInteractive(payload *InteractivePayload) bool {
	return payload != nil &&
		payload.Type == InteractiveTypeUserSelect &&
		payload.UserSelect != nil &&
		payload.UserSelect.UserSelectOptions != nil
}

// IsUserInputInteractive reports whether payload is a validated userInput form prompt.
func IsUserInputInteractive(payload *InteractivePayload) bool {
	return payload != nil &&
		payload.Type == InteractiveTypeUserInput &&
		payload.UserInput != nil &&
		payload.UserInput.InputForm != nil
}

// IsPaymentPauseInteractive reports whether payload is a paymentPause prompt.
func IsPaymentPauseInteractive(payload *InteractivePayload) bool {
	return payload != nil &&
		payload.Type == InteractiveTypePaymentPause &&
		payload.PaymentPause != nil
}

// UnwrapInteractive recursively unwraps nested sub-workflow or loop interactive wrappers
// (childrenResponse) to return the innermost interactive payload requiring user response.
func UnwrapInteractive(interactive *InteractivePayload) *InteractivePayload {
	if interactive == nil {
		return nil
	}
	const maxDepth = 10
	current := interactive
	for range maxDepth {
		if current.Nested != nil && current.Nested.ChildrenResponse != nil {
			current = current.Nested.ChildrenResponse
			continue
		}
		if current.Params != nil {
			if child := parseInteractivePayload(current.Params["childrenResponse"], maxDepth); child != nil {
				current = child
				continue
			}
		}
		return current
	}
	return current
}

func extractInteractiveFromCompletion(res ChatCompletionsV2Res) *InteractivePayload {
	if len(res.Choices) == 0 {
		return nil
	}
	parts, ok := res.Choices[0].Message.Content.Parts()
	if !ok {
		return nil
	}
	for _, item := range parts {
		if parsed := parseInteractivePayload(item["interactive"], 12); parsed != nil {
			return parsed
		}
	}
	return nil
}

// ExtractInteractive inspects a ChatStreamFinalResult, ChatCompletionsV2Res, InteractivePayload,
// or raw JSON/map response and returns any pending interactive payload, or nil if none is present.
func ExtractInteractive(result any) *InteractivePayload {
	if result == nil {
		return nil
	}

	switch v := result.(type) {
	case *InteractivePayload:
		return parseInteractivePayload(v, 12)
	case InteractivePayload:
		return parseInteractivePayload(v, 12)
	case *ChatCompletionsV2Res:
		if v == nil {
			return nil
		}
		return extractInteractiveFromCompletion(*v)
	case ChatCompletionsV2Res:
		return extractInteractiveFromCompletion(v)
	case *ChatStreamFinalResult:
		if v == nil {
			return nil
		}
		if v.Interactive != nil {
			return v.Interactive
		}
		return parseInteractivePayload(v.RawInteractive, 12)
	case ChatStreamFinalResult:
		if v.Interactive != nil {
			return v.Interactive
		}
		return parseInteractivePayload(v.RawInteractive, 12)
	case ChatSSEInteractiveEvent:
		if v.Interactive != nil {
			return v.Interactive
		}
		return parseInteractivePayload(v.Value, 12)
	case json.RawMessage:
		var decoded any
		if err := json.Unmarshal(v, &decoded); err != nil {
			return nil
		}
		return extractInteractiveFromAny(decoded)
	case []byte:
		var decoded any
		if err := json.Unmarshal(v, &decoded); err != nil {
			return nil
		}
		return extractInteractiveFromAny(decoded)
	case map[string]any:
		return extractInteractiveFromAny(v)
	}

	rawBytes, err := json.Marshal(result)
	if err != nil {
		return nil
	}
	var decoded any
	if err := json.Unmarshal(rawBytes, &decoded); err != nil {
		return nil
	}
	return extractInteractiveFromAny(decoded)
}

func extractInteractiveFromAny(val any) *InteractivePayload {
	m, ok := toStringAnyMap(val)
	if !ok {
		return nil
	}

	if top := parseInteractivePayload(m["interactive"], 12); top != nil {
		return top
	}
	if direct := parseInteractivePayload(m, 12); direct != nil {
		return direct
	}

	choices, ok := m["choices"].([]any)
	if !ok || len(choices) == 0 {
		return nil
	}
	firstChoice, ok := toStringAnyMap(choices[0])
	if !ok {
		return nil
	}
	message, ok := toStringAnyMap(firstChoice["message"])
	if !ok {
		return nil
	}
	content, ok := message["content"].([]any)
	if !ok {
		return nil
	}
	for _, item := range content {
		itemMap, ok := toStringAnyMap(item)
		if !ok {
			continue
		}
		if parsed := parseInteractivePayload(itemMap["interactive"], 12); parsed != nil {
			return parsed
		}
	}
	return nil
}

// IsInteractivePending reports whether a completion or stream final result contains a pending interactive prompt.
func IsInteractivePending(result any) bool {
	return ExtractInteractive(result) != nil
}

// BuildUserSelectMessage constructs a user recovery message matching FastGPT's dispatchUserSelect protocol.
func BuildUserSelectMessage(selectedValue string) InteractiveUserMessage {
	return UserMessage(selectedValue)
}

// BuildUserFormMessage constructs a user recovery message matching FastGPT's dispatchFormInput protocol.
func BuildUserFormMessage(values map[string]any) (InteractiveUserMessage, error) {
	if values == nil {
		values = map[string]any{}
	}
	encoded, err := json.Marshal(values)
	if err != nil {
		return InteractiveUserMessage{}, err
	}
	return UserMessage(string(encoded)), nil
}

// InteractiveService exposes workflow interactive pause detection, unwrapping, and resumption helpers
// mounted on Client.Chat.Interactive.
type InteractiveService struct {
	chat *ChatResource
}

func newInteractiveService(chat *ChatResource) *InteractiveService {
	return &InteractiveService{chat: chat}
}

// IsInteractivePending reports whether result contains a pending workflow interactive pause.
func (s *InteractiveService) IsInteractivePending(result any) bool {
	return IsInteractivePending(result)
}

// ExtractInteractive extracts any pending interactive payload from a completion or stream final result.
func (s *InteractiveService) ExtractInteractive(result any) *InteractivePayload {
	return ExtractInteractive(result)
}

// UnwrapInteractive unwraps nested sub-workflow/loop wrappers to locate the innermost prompt.
func (s *InteractiveService) UnwrapInteractive(interactive *InteractivePayload) *InteractivePayload {
	return UnwrapInteractive(interactive)
}

// BuildUserSelectMessage builds the user recovery message for a userSelect interactive prompt.
func (s *InteractiveService) BuildUserSelectMessage(selectedValue string) InteractiveUserMessage {
	return BuildUserSelectMessage(selectedValue)
}

// BuildUserFormMessage builds the user recovery message for a userInput form interactive prompt.
func (s *InteractiveService) BuildUserFormMessage(values map[string]any) (InteractiveUserMessage, error) {
	return BuildUserFormMessage(values)
}

func buildUserSelectCompletionsParams(params ReplyUserSelectParams) ChatCompletionsV2Params {
	return ChatCompletionsV2Params{
		AppID:               params.AppID,
		ChatID:              String(params.ChatID),
		Metadata:            params.Metadata,
		Messages:            Some([]ChatMessage{BuildUserSelectMessage(params.Value)}),
		Variables:           params.Variables,
		ResponseChatItemID:  params.ResponseChatItemID,
		Detail:              params.Detail,
		RetainDatasetCite:   params.RetainDatasetCite,
		ShowSkillReferences: params.ShowSkillReferences,
		CustomUID:           params.CustomUID,
		AuthProxy:           params.AuthProxy,
	}
}

func buildUserFormCompletionsParams(params ReplyUserFormParams) (ChatCompletionsV2Params, error) {
	msg, err := BuildUserFormMessage(params.Values)
	if err != nil {
		return ChatCompletionsV2Params{}, newBadRequestError("Failed to encode interactive form values", "", err, nil)
	}
	return ChatCompletionsV2Params{
		AppID:               params.AppID,
		ChatID:              String(params.ChatID),
		Metadata:            params.Metadata,
		Messages:            Some([]ChatMessage{msg}),
		Variables:           params.Variables,
		ResponseChatItemID:  params.ResponseChatItemID,
		Detail:              params.Detail,
		RetainDatasetCite:   params.RetainDatasetCite,
		ShowSkillReferences: params.ShowSkillReferences,
		CustomUID:           params.CustomUID,
		AuthProxy:           params.AuthProxy,
	}, nil
}

// ReplyUserSelect submits a userSelect choice and resumes workflow execution in non-streaming mode.
func (s *InteractiveService) ReplyUserSelect(
	ctx context.Context,
	params ReplyUserSelectParams,
	opts ...RequestOption,
) (*ChatCompletionsV2Res, error) {
	return s.chat.CompletionsV2(ctx, buildUserSelectCompletionsParams(params), opts...)
}

// ReplyUserSelectStream submits a userSelect choice and resumes workflow execution as an SSE stream.
func (s *InteractiveService) ReplyUserSelectStream(
	ctx context.Context,
	params ReplyUserSelectParams,
	opts ...RequestOption,
) (*ChatStream, error) {
	return s.chat.CompletionsV2Stream(ctx, buildUserSelectCompletionsParams(params), opts...)
}

// ReplyUserForm submits userInput form values and resumes workflow execution in non-streaming mode.
func (s *InteractiveService) ReplyUserForm(
	ctx context.Context,
	params ReplyUserFormParams,
	opts ...RequestOption,
) (*ChatCompletionsV2Res, error) {
	reqParams, err := buildUserFormCompletionsParams(params)
	if err != nil {
		return nil, err
	}
	return s.chat.CompletionsV2(ctx, reqParams, opts...)
}

// ReplyUserFormStream submits userInput form values and resumes workflow execution as an SSE stream.
func (s *InteractiveService) ReplyUserFormStream(
	ctx context.Context,
	params ReplyUserFormParams,
	opts ...RequestOption,
) (*ChatStream, error) {
	reqParams, err := buildUserFormCompletionsParams(params)
	if err != nil {
		return nil, err
	}
	return s.chat.CompletionsV2Stream(ctx, reqParams, opts...)
}

func cloneStringSlice(in []string) []string {
	return slices.Clone(in)
}
