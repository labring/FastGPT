{{/*
扩展chart名称
*/}}
{{- define "opensandbox-controller.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
创建完整的限定名称
*/}}
{{- define "opensandbox-controller.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart标签
*/}}
{{- define "opensandbox-controller.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
通用标签
*/}}
{{- define "opensandbox-controller.labels" -}}
helm.sh/chart: {{ include "opensandbox-controller.chart" . }}
{{ include "opensandbox-controller.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.labels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
选择器标签
*/}}
{{- define "opensandbox-controller.selectorLabels" -}}
app.kubernetes.io/name: {{ include "opensandbox-controller.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
control-plane: controller-manager
{{- end }}

{{/*
创建ServiceAccount名称
*/}}
{{- define "opensandbox-controller.serviceAccountName" -}}
{{- if .Values.rbac.serviceAccount.create }}
{{- default (printf "%scontroller-manager" .Values.namePrefix) .Values.rbac.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.rbac.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
命名空间
*/}}
{{- define "opensandbox-controller.namespace" -}}
{{- if .Values.namespaceOverride }}
{{- .Values.namespaceOverride }}
{{- else }}
{{- printf "%ssystem" .Values.namePrefix }}
{{- end }}
{{- end }}

{{/*
Controller镜像
*/}}
{{- define "opensandbox-controller.controllerImage" -}}
{{- printf "%s:%s" .Values.controllerManager.image.repository (.Values.controllerManager.image.tag | default .Chart.AppVersion) }}
{{- end }}

{{/*
Task Executor镜像
*/}}
{{- define "opensandbox-controller.taskExecutorImage" -}}
{{- printf "%s:%s" .Values.taskExecutor.image.repository (.Values.taskExecutor.image.tag | default .Chart.AppVersion) }}
{{- end }}
