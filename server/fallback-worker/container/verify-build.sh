#!/bin/sh
set -eu

ffmpeg_bin="${FFMPEG_BIN:-ffmpeg}"
ffprobe_bin="${FFPROBE_BIN:-ffprobe}"

version_output="$(${ffmpeg_bin} -hide_banner -version 2>/dev/null)"
license_output="$(${ffmpeg_bin} -hide_banner -L 2>/dev/null)"
printf '%s\n' "$license_output" | grep -F "Lesser General Public License" >/dev/null
printf '%s\n' "$license_output" | grep -F "version 2.1" >/dev/null
printf '%s\n' "$version_output" | grep -F -- "--disable-gpl" >/dev/null
printf '%s\n' "$version_output" | grep -F -- "--disable-nonfree" >/dev/null
! printf '%s\n' "$version_output" | grep -E -- "libx264|libx265|--enable-gpl|--enable-nonfree" >/dev/null

encoder_list="$(${ffmpeg_bin} -hide_banner -encoders 2>/dev/null)"
printf '%s\n' "$encoder_list" | grep -E "libvpx-vp9|libopus" >/dev/null
! printf '%s\n' "$encoder_list" | grep -E "libx264|libx265" >/dev/null

protocol_list="$(${ffmpeg_bin} -hide_banner -protocols 2>/dev/null)"
! printf '%s\n' "$protocol_list" | grep -E "(^|[[:space:]])(http|https|ftp|tcp|udp)([[:space:]]|$)" >/dev/null

${ffmpeg_bin} -hide_banner -formats 2>/dev/null | grep -E "matroska|webm" >/dev/null
${ffmpeg_bin} -hide_banner -filters 2>/dev/null | grep -E "(^|[[:space:]])aresample([[:space:]]|$)" >/dev/null
${ffprobe_bin} -hide_banner -version >/dev/null
