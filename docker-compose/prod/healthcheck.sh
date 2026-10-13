#!/bin/bash
port="$1"
exec 3<>"/dev/tcp/127.0.0.1/${port}" || exit 1
printf 'GET /actuator/health/readiness HTTP/1.0\r\nHost: localhost\r\n\r\n' >&3
timeout 4 grep -q UP <&3
