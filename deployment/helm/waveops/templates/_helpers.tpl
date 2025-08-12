{{/*
Expand the name of the chart.
*/}}
{{- define "waveops.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "waveops.fullname" -}}
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
Create chart name and version as used by the chart label.
*/}}
{{- define "waveops.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "waveops.labels" -}}
helm.sh/chart: {{ include "waveops.chart" . }}
{{ include "waveops.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: waveops
{{- end }}

{{/*
Selector labels
*/}}
{{- define "waveops.selectorLabels" -}}
app.kubernetes.io/name: {{ include "waveops.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "waveops.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "waveops.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the secret to use
*/}}
{{- define "waveops.secretName" -}}
{{- if .Values.secrets.create }}
{{- include "waveops.fullname" . }}-secrets
{{- else }}
{{- default (include "waveops.fullname" .) .Values.secrets.name }}
{{- end }}
{{- end }}

{{/*
Create the name of the configmap to use
*/}}
{{- define "waveops.configMapName" -}}
{{- include "waveops.fullname" . }}-config
{{- end }}

{{/*
Create the Docker image reference
*/}}
{{- define "waveops.image" -}}
{{- $registry := .Values.waveops.image.registry -}}
{{- $repository := .Values.waveops.image.repository -}}
{{- $tag := .Values.waveops.image.tag | default .Chart.AppVersion -}}
{{- if .Values.global.imageRegistry -}}
{{- printf "%s/%s:%s" .Values.global.imageRegistry $repository $tag -}}
{{- else if $registry -}}
{{- printf "%s/%s:%s" $registry $repository $tag -}}
{{- else -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end }}
{{- end }}

{{/*
Database connection URL
*/}}
{{- define "waveops.databaseUrl" -}}
{{- if .Values.postgresql.enabled }}
{{- $host := printf "%s-postgresql" (include "waveops.fullname" .) }}
{{- $port := "5432" }}
{{- $database := .Values.postgresql.auth.database }}
{{- $username := "postgres" }}
{{- printf "postgresql://%s:$(POSTGRES_PASSWORD)@%s:%s/%s" $username $host $port $database }}
{{- else }}
{{- .Values.secrets.database.url }}
{{- end }}
{{- end }}

{{/*
Redis connection URL
*/}}
{{- define "waveops.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- $host := printf "%s-redis-master" (include "waveops.fullname" .) }}
{{- $port := "6379" }}
{{- if .Values.redis.auth.enabled }}
{{- printf "redis://:%s@%s:%s" "$(REDIS_PASSWORD)" $host $port }}
{{- else }}
{{- printf "redis://%s:%s" $host $port }}
{{- end }}
{{- else }}
{{- .Values.secrets.redis.url }}
{{- end }}
{{- end }}

{{/*
Prometheus server URL
*/}}
{{- define "waveops.prometheusUrl" -}}
{{- if .Values.monitoring.prometheus.enabled }}
{{- printf "http://%s-prometheus-server" (include "waveops.fullname" .) }}
{{- else }}
{{- "http://prometheus:9090" }}
{{- end }}
{{- end }}

{{/*
Grafana server URL
*/}}
{{- define "waveops.grafanaUrl" -}}
{{- if .Values.monitoring.grafana.enabled }}
{{- printf "http://%s-grafana" (include "waveops.fullname" .) }}
{{- else }}
{{- "http://grafana:3000" }}
{{- end }}
{{- end }}

{{/*
Jaeger server URL
*/}}
{{- define "waveops.jaegerUrl" -}}
{{- if .Values.tracing.jaeger.enabled }}
{{- printf "http://%s-jaeger-collector:14268/api/traces" (include "waveops.fullname" .) }}
{{- else }}
{{- "http://jaeger:14268/api/traces" }}
{{- end }}
{{- end }}

{{/*
Common environment variables
*/}}
{{- define "waveops.commonEnv" -}}
- name: WAVEOPS_INSTANCE_ID
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: WAVEOPS_NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
- name: WAVEOPS_NODE_NAME
  valueFrom:
    fieldRef:
      fieldPath: spec.nodeName
- name: WAVEOPS_POD_IP
  valueFrom:
    fieldRef:
      fieldPath: status.podIP
{{- end }}

{{/*
Generate a random password if not provided
*/}}
{{- define "waveops.randomPassword" -}}
{{- $length := 32 }}
{{- $chars := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*" }}
{{- $password := "" }}
{{- range $i := until $length }}
{{- $password = printf "%s%c" $password (index $chars (randInt 0 (len $chars))) }}
{{- end }}
{{- $password }}
{{- end }}

{{/*
Validate required values
*/}}
{{- define "waveops.validateValues" -}}
{{- if not .Values.secrets.github.token }}
{{- fail "GitHub token is required. Please set secrets.github.token" }}
{{- end }}
{{- if not .Values.secrets.jwt.secret }}
{{- fail "JWT secret is required. Please set secrets.jwt.secret" }}
{{- end }}
{{- if not .Values.secrets.encryption.key }}
{{- fail "Encryption key is required. Please set secrets.encryption.key" }}
{{- end }}
{{- end }}

{{/*
Network policy peer selectors
*/}}
{{- define "waveops.networkPolicyPeers" -}}
{{- range .Values.networkPolicy.ingress }}
{{- if .from }}
{{- toYaml .from | nindent 2 }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Resource quotas
*/}}
{{- define "waveops.resourceQuotas" -}}
requests.cpu: {{ mul .Values.waveops.resources.requests.cpu 10 | quote }}
requests.memory: {{ mul .Values.waveops.resources.requests.memory 10 | quote }}
limits.cpu: {{ mul .Values.waveops.resources.limits.cpu 10 | quote }}
limits.memory: {{ mul .Values.waveops.resources.limits.memory 10 | quote }}
{{- end }}

{{/*
Common annotations
*/}}
{{- define "waveops.commonAnnotations" -}}
app.kubernetes.io/managed-by: helm
helm.sh/chart: {{ include "waveops.chart" . }}
meta.helm.sh/release-name: {{ .Release.Name }}
meta.helm.sh/release-namespace: {{ .Release.Namespace }}
{{- end }}

{{/*
Pod security context
*/}}
{{- define "waveops.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1001
runAsGroup: 1001
fsGroup: 1001
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/*
Container security context
*/}}
{{- define "waveops.securityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
runAsNonRoot: true
runAsUser: 1001
runAsGroup: 1001
capabilities:
  drop:
  - ALL
seccompProfile:
  type: RuntimeDefault
{{- end }}