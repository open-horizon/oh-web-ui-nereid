{{/*
Copyright (C) 2026 YIQISOFT
SPDX-License-Identifier: Apache-2.0

Expanded name / label helpers shared by every template. Chart naming follows
the standard name-template->fullname-template chain so nameOverride and
fullnameOverride behave like the official Helm charts.
*/}}

{{/*
Resource name stem. The Chart name itself is CamelCase (product naming), but
Kubernetes metadata.name must be an all-lowercase DNS label, so the stem used
for every Service/Deployment/Secret name is the lower-cased chart name;
nameOverride/fullnameOverride replace it verbatim.
*/}}
{{- define "nereidhorizon.name" -}}
{{- default (lower .Chart.Name) .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "nereidhorizon.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default (lower .Chart.Name) .Values.nameOverride -}}
{{- if contains $name (lower .Release.Name) -}}
{{- lower .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | lower | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "nereidhorizon.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{ include "nereidhorizon.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "nereidhorizon.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nereidhorizon.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "nereidhorizon.backendSvcName" -}}
{{- printf "%s-backend" (include "nereidhorizon.fullname" .) -}}
{{- end -}}

{{- define "nereidhorizon.postgresSvcName" -}}
{{- printf "%s-postgres" (include "nereidhorizon.fullname" .) -}}
{{- end -}}

{{- define "nereidhorizon.backendImage" -}}
{{- $img := .Values.backend.image -}}
{{- printf "%s/%s:%s" $img.registry $img.repository (default .Chart.AppVersion $img.tag | toString) -}}
{{- end -}}

{{- define "nereidhorizon.frontendImage" -}}
{{- $img := .Values.frontend.image -}}
{{- printf "%s/%s:%s" $img.registry $img.repository (default .Chart.AppVersion $img.tag | toString) -}}
{{- end -}}

{{/*
Effective image pull secret name list: rendered verbatim from
global.imagePullSecrets so Harbor projects that stay private can be pulled
with a pre-created registry secret.
*/}}
{{- define "nereidhorizon.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets:
{{ toYaml . | indent 2 }}
{{- end -}}
{{- end -}}
