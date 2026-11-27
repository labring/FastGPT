package fastgpt

import (
	"bytes"
	"cmp"
	"encoding/json"
	"fmt"
	"io"
	"maps"
	"mime/multipart"
	"net/textproto"
	"slices"
	"strconv"
	"strings"
)

var multipartQuoteReplacer = strings.NewReplacer("\\", "\\\\", `"`, "\\\"")

func escapeMultipartQuotes(s string) string {
	return multipartQuoteReplacer.Replace(s)
}

func writeMultipartFilePart(mw *multipart.Writer, fieldName string, f FileUpload) error {
	if f.Bytes == nil && f.Reader == nil {
		return newBadRequestError(
			fmt.Sprintf("Multipart upload field %q requires Bytes or Reader", fieldName),
			"",
			nil,
			nil,
		)
	}

	filename := cmp.Or(f.Filename, "upload.bin")
	contentType := cmp.Or(f.ContentType, "application/octet-stream")

	header := make(textproto.MIMEHeader)
	header.Set(
		"Content-Disposition",
		fmt.Sprintf(
			`form-data; name="%s"; filename="%s"`,
			escapeMultipartQuotes(fieldName),
			escapeMultipartQuotes(filename),
		),
	)
	header.Set("Content-Type", contentType)

	part, err := mw.CreatePart(header)
	if err != nil {
		return newBadRequestError("Failed to create multipart file part", "", err, nil)
	}

	if len(f.Bytes) > 0 || f.Reader == nil {
		if _, err := part.Write(f.Bytes); err != nil {
			return newBadRequestError("Failed to write multipart file bytes", "", err, nil)
		}
		return nil
	}

	if _, err := io.Copy(part, f.Reader); err != nil {
		return newBadRequestError("Failed to read multipart file stream", "", err, nil)
	}
	return nil
}

func formatScalarValue(v any) string {
	switch val := v.(type) {
	case string:
		return val
	case json.Number:
		return val.String()
	case bool:
		return strconv.FormatBool(val)
	case int:
		return strconv.Itoa(val)
	case int8:
		return strconv.FormatInt(int64(val), 10)
	case int16:
		return strconv.FormatInt(int64(val), 10)
	case int32:
		return strconv.FormatInt(int64(val), 10)
	case int64:
		return strconv.FormatInt(val, 10)
	case uint:
		return strconv.FormatUint(uint64(val), 10)
	case uint8:
		return strconv.FormatUint(uint64(val), 10)
	case uint16:
		return strconv.FormatUint(uint64(val), 10)
	case uint32:
		return strconv.FormatUint(uint64(val), 10)
	case uint64:
		return strconv.FormatUint(val, 10)
	case float32:
		return strconv.FormatFloat(float64(val), 'g', -1, 32)
	case float64:
		return strconv.FormatFloat(val, 'g', -1, 64)
	default:
		return fmt.Sprint(val)
	}
}

func isScalarValue(v any) bool {
	switch v.(type) {
	case string, json.Number, bool,
		int, int8, int16, int32, int64,
		uint, uint8, uint16, uint32, uint64,
		float32, float64:
		return true
	default:
		return false
	}
}

// encodeMultipartBody 根据 multipartMode 编码 multipart/form-data 请求体：
// - multipartFileAndJSONData：写入 file 二进制分片，并将剩余非空参数打包为 JSON 写入 data 表单字段；
// - multipartFlatFields：按字段名平铺写入文件与标量/JSON 字段。
func encodeMultipartBody(
	mode multipartMode,
	payload map[string]any,
	files map[string][]FileUpload,
) ([]byte, string, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	if mode == multipartFileAndJSONData {
		fileUploads := files["file"]
		if len(fileUploads) == 0 {
			return nil, "", newBadRequestError(
				`Multipart upload requires a non-empty "file" field`,
				"",
				nil,
				nil,
			)
		}
		for _, upload := range fileUploads {
			if err := writeMultipartFilePart(mw, "file", upload); err != nil {
				return nil, "", err
			}
		}

		dataPayload := make(map[string]any, len(payload))
		for key, val := range payload {
			if key == "file" {
				continue
			}
			dataPayload[key] = val
		}
		jsonBytes, err := json.Marshal(dataPayload)
		if err != nil {
			return nil, "", newBadRequestError("Failed to marshal multipart data JSON", "", err, nil)
		}
		if err := mw.WriteField("data", string(jsonBytes)); err != nil {
			return nil, "", newBadRequestError("Failed to write multipart data field", "", err, nil)
		}
		if err := mw.Close(); err != nil {
			return nil, "", newBadRequestError("Failed to finalize multipart body", "", err, nil)
		}
		return buf.Bytes(), mw.FormDataContentType(), nil
	}

	for _, fieldName := range slices.Sorted(maps.Keys(files)) {
		for _, upload := range files[fieldName] {
			if err := writeMultipartFilePart(mw, fieldName, upload); err != nil {
				return nil, "", err
			}
		}
	}

	for _, key := range slices.Sorted(maps.Keys(payload)) {
		val := payload[key]
		if val == nil || key == "file" {
			continue
		}
		var fieldVal string
		if isScalarValue(val) {
			fieldVal = formatScalarValue(val)
		} else {
			encoded, err := json.Marshal(val)
			if err != nil {
				return nil, "", newBadRequestError(
					fmt.Sprintf("Failed to encode multipart field %q", key),
					"",
					err,
					nil,
				)
			}
			fieldVal = string(encoded)
		}
		if err := mw.WriteField(key, fieldVal); err != nil {
			return nil, "", newBadRequestError(
				fmt.Sprintf("Failed to write multipart field %q", key),
				"",
				err,
				nil,
			)
		}
	}

	if err := mw.Close(); err != nil {
		return nil, "", newBadRequestError("Failed to finalize multipart body", "", err, nil)
	}
	return buf.Bytes(), mw.FormDataContentType(), nil
}
