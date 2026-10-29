{{/*
Nome del chart, troncato al limite DNS di 63 caratteri.
*/}}
{{- define "easybank.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "easybank.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Etichette di un workload. Il selettore resta solo app:<nome>, come nei manifest k8s.
Chiamare con (dict "name" $name "root" $).
*/}}
{{- define "easybank.serviceLabels" -}}
app: {{ .name }}
helm.sh/chart: {{ include "easybank.chart" .root }}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/part-of: easy-bank
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
{{- if .root.Chart.AppVersion }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
{{- end }}
{{- end }}
