#!/usr/bin/env bash
set -euo pipefail

FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
WM="client/public/investor/guber-wordmark-green.png"
SHIELD="client/public/investor/guber-shield-gold.png"

VID="attached_assets/generated_videos"
AUD="attached_assets/generated_audio"
TMP="attached_assets/_tmp_commercial"
OUT="attached_assets/guber-loadboard-commercial.mp4"
mkdir -p "$TMP"

GREEN="0x39FF14"
W=720; H=1280

# ---- per-clip durations (matched to voiceover lengths) ----
D1=7.0; D2=7.0; D3=9.8; D4=6.0

common_scale="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1"

# ---------- BEAT 1 : Load board ----------
ffmpeg -y -i "$VID/guber_loadboard_driver.mp4" -i "$WM" -filter_complex "
[0:v]${common_scale},fps=24,trim=0:${D1},setpts=PTS-STARTPTS,eq=contrast=1.05:saturation=1.15[b];
[1:v]scale=320:-1,format=rgba,colorchannelmixer=aa=0.92[wm];
[b][wm]overlay=(W-w)/2:80[bw];
[bw]drawtext=fontfile=${FONT}:text='TRUSTED LOAD BOARD':fontcolor=white:fontsize=48:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-340:alpha='if(lt(t,0.3),t/0.3,1)',
drawtext=fontfile=${FONT}:text='Post a load. Verified haulers near you.':fontcolor=${GREEN}:fontsize=27:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-260:alpha='if(lt(t,0.5),t/0.5,1)'[v]
" -map "[v]" -an -t ${D1} -r 24 -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 "$TMP/c1.mp4"

# ---------- BEAT 2 : Why protection ----------
ffmpeg -y -i "$VID/guber_asset_loading.mp4" -i "$WM" -filter_complex "
[0:v]${common_scale},fps=24,trim=0:${D2},setpts=PTS-STARTPTS,eq=contrast=1.05:saturation=1.15[b];
[1:v]scale=320:-1,format=rgba,colorchannelmixer=aa=0.92[wm];
[b][wm]overlay=(W-w)/2:80[bw];
[bw]drawtext=fontfile=${FONT}:text='ASSET PROTECTION':fontcolor=white:fontsize=50:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-340:alpha='if(lt(t,0.3),t/0.3,1)',
drawtext=fontfile=${FONT}:text='Your cargo deserves more than a handshake':fontcolor=${GREEN}:fontsize=26:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-260:alpha='if(lt(t,0.5),t/0.5,1)'[v]
" -map "[v]" -an -t ${D2} -r 24 -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 "$TMP/c2.mp4"

# ---------- BEAT 3 : How it works (slowed 8s -> 9.8s) ----------
ffmpeg -y -i "$VID/guber_gps_secure.mp4" -i "$WM" -filter_complex "
[0:v]${common_scale},setpts=1.225*PTS,fps=24,trim=0:${D3},setpts=PTS-STARTPTS,eq=contrast=1.05:saturation=1.18[b];
[1:v]scale=320:-1,format=rgba,colorchannelmixer=aa=0.92[wm];
[b][wm]overlay=(W-w)/2:80[bw];
[bw]drawtext=fontfile=${FONT}:text='GPS-LOCKED HANDOFF':fontcolor=white:fontsize=48:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-380:alpha='if(lt(t,0.3),t/0.3,1)',
drawtext=fontfile=${FONT}:text='TOW - TRAILER - VIN - VERIFIED':fontcolor=${GREEN}:fontsize=28:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-300:alpha='if(lt(t,0.6),t/0.6,1)',
drawtext=fontfile=${FONT}:text='No code. No release.':fontcolor=white:fontsize=40:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-220:alpha='if(lt(t,5),0,if(lt(t,5.4),(t-5)/0.4,1))'[v]
" -map "[v]" -an -t ${D3} -r 24 -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 "$TMP/c3.mp4"

# ---------- BEAT 4 : Safe delivery + logo reveal ----------
ffmpeg -y -i "$VID/guber_safe_delivery.mp4" -i "$SHIELD" -i "$WM" -filter_complex "
[0:v]${common_scale},fps=24,trim=0:${D4},setpts=PTS-STARTPTS,eq=contrast=1.05:saturation=1.15[b];
[1:v]scale=300:-1,format=rgba[sh];
[2:v]scale=440:-1,format=rgba[wm];
[b][sh]overlay=(W-w)/2:H*0.30:enable='gte(t,0.4)'[bs];
[bs][wm]overlay=(W-w)/2:H*0.52:enable='gte(t,0.8)'[bw];
[bw]drawtext=fontfile=${FONT}:text='MOVE WITH CONFIDENCE':fontcolor=${GREEN}:fontsize=44:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-300:alpha='if(lt(t,1.2),0,if(lt(t,1.7),(t-1.2)/0.5,1))'[v]
" -map "[v]" -an -t ${D4} -r 24 -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 "$TMP/c4.mp4"

# ---------- CONCAT video ----------
printf "file '%s'\n" "c1.mp4" "c2.mp4" "c3.mp4" "c4.mp4" > "$TMP/list.txt"
ffmpeg -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/video_concat.mp4"

# total = 7+7+9.8+6 = 29.8
TOTAL=29.8

# ---------- AUDIO mix : voiceovers + music ----------
ffmpeg -y \
  -i "$AUD/music_guber_motivational_bed.mp3" \
  -i "$AUD/vo1.mp3" -i "$AUD/vo2.mp3" -i "$AUD/vo3.mp3" -i "$AUD/vo4.mp3" \
  -filter_complex "
[1:a]volume=1.45,adelay=150|150[a1];
[2:a]volume=1.45,adelay=7000|7000[a2];
[3:a]volume=1.45,adelay=14000|14000[a3];
[4:a]volume=1.45,adelay=23800|23800[a4];
[0:a]volume=0.16,afade=t=in:st=0:d=0.6,afade=t=out:st=28.0:d=1.8[mus];
[a1][a2][a3][a4][mus]amix=inputs=5:duration=longest:normalize=0,alimiter=limit=0.95[aout]
" -map "[aout]" -t ${TOTAL} -c:a aac -b:a 192k "$TMP/audio_mix.m4a"

# ---------- FINAL mux : video fade in/out + audio ----------
ffmpeg -y -i "$TMP/video_concat.mp4" -i "$TMP/audio_mix.m4a" -filter_complex "
[0:v]fade=t=in:st=0:d=0.5,fade=t=out:st=29.2:d=0.6[v]
" -map "[v]" -map "1:a" -t ${TOTAL} \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT"

echo "BUILT: $OUT"
ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 "$OUT"
