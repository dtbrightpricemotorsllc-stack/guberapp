#!/usr/bin/env bash
set -euo pipefail

FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
WM="client/public/investor/guber-wordmark-green.png"
SHIELD="client/public/investor/guber-shield-gold.png"
STILL="attached_assets/_tmp_still"
AUD="attached_assets/generated_audio"
TMP="attached_assets/_tmp_v2"
OUT="attached_assets/guber-loadboard-commercial-v2.mp4"
mkdir -p "$TMP"

GREEN="0x39FF14"
W=720; H=1280

# Durations (s) matched to voiceover beats
D1=7.0; D2=7.0; D3A=4.9; D3B=4.9; D4=6.0
# Frame counts at 24fps
F1=168; F2=168; F3A=118; F3B=118; F4=144

# ── shared scale: ensure image is large enough for zoompan zoom room ──
PRESCALE="scale=900:1600:force_original_aspect_ratio=increase,crop=900:1600,setsar=1"

# ── wordmark prep (shared) ──
WM_FILTER="[wmin]scale=300:-1,format=rgba,colorchannelmixer=aa=0.93[wm]"

# ───────────────────────────────────────────────
# BEAT 1 — Driver at load board (slow zoom in)
# Captions: GUBER LOAD BOARD / subtitle
# ───────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$STILL/s1_driver_loadboard.png" -i "$WM" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='min(zoom+0.0008,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${F1}:s=${W}x${H}:fps=24[zp];
[1:v]scale=300:-1,format=rgba,colorchannelmixer=aa=0.93[wm];
[zp][wm]overlay=(W-w)/2:72[bw];
[bw]drawtext=fontfile=${FONT}:text='GUBER LOAD BOARD':fontcolor=white:fontsize=50:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-360:alpha='if(lt(t,0.4),t/0.4,1)',
drawtext=fontfile=${FONT_REG}:text='Post a load. Verified haulers respond fast.':fontcolor=${GREEN}:fontsize=28:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-280:alpha='if(lt(t,0.6),t/0.6,1)'[v]
" -map "[v]" -an -t ${D1} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 "$TMP/c1.mp4"
echo ">> c1 done"

# ───────────────────────────────────────────────
# BEAT 2 — Flatbed on highway (slow pan left→right)
# Captions: ASSET PROTECTION / subtitle
# ───────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$STILL/s2_flatbed_truck.png" -i "$WM" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='1.12':x='min(iw/zoom/2+on*0.8,iw-iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${F2}:s=${W}x${H}:fps=24[zp];
[1:v]scale=300:-1,format=rgba,colorchannelmixer=aa=0.93[wm];
[zp][wm]overlay=(W-w)/2:72[bw];
[bw]drawtext=fontfile=${FONT}:text='ASSET PROTECTION':fontcolor=white:fontsize=52:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-360:alpha='if(lt(t,0.4),t/0.4,1)',
drawtext=fontfile=${FONT_REG}:text='Your cargo deserves more than a handshake.':fontcolor=${GREEN}:fontsize=27:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-280:alpha='if(lt(t,0.6),t/0.6,1)'[v]
" -map "[v]" -an -t ${D2} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 "$TMP/c2.mp4"
echo ">> c2 done"

# ───────────────────────────────────────────────
# BEAT 3A — Driver selfie at pickup (zoom in on face)
# Captions: VERIFIED AT PICKUP / subtitle
# ───────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$STILL/s3a_driver_selfie.png" -i "$WM" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='min(zoom+0.0012,1.22)':x='iw/2-(iw/zoom/2)':y='max(ih*0.22-(ih/zoom/2),0)':d=${F3A}:s=${W}x${H}:fps=24[zp];
[1:v]scale=300:-1,format=rgba,colorchannelmixer=aa=0.93[wm];
[zp][wm]overlay=(W-w)/2:72[bw];
[bw]drawtext=fontfile=${FONT}:text='VERIFIED AT PICKUP':fontcolor=white:fontsize=48:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-360:alpha='if(lt(t,0.3),t/0.3,1)',
drawtext=fontfile=${FONT_REG}:text='Driver selfie. GPS-confirmed location.':fontcolor=${GREEN}:fontsize=28:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-280:alpha='if(lt(t,0.5),t/0.5,1)'[v]
" -map "[v]" -an -t ${D3A} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 "$TMP/c3a.mp4"
echo ">> c3a done"

# ───────────────────────────────────────────────
# BEAT 3B — VIN photo documentation (slow zoom in)
# Captions: EQUIPMENT DOCUMENTED / subtitle
# ───────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$STILL/s3b_vin_photo.png" -i "$WM" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='min(zoom+0.0012,1.22)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${F3B}:s=${W}x${H}:fps=24[zp];
[1:v]scale=300:-1,format=rgba,colorchannelmixer=aa=0.93[wm];
[zp][wm]overlay=(W-w)/2:72[bw];
[bw]drawtext=fontfile=${FONT}:text='EQUIPMENT DOCUMENTED':fontcolor=white:fontsize=45:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-360:alpha='if(lt(t,0.3),t/0.3,1)',
drawtext=fontfile=${FONT_REG}:text='Tow, trailer and VIN - on the record.':fontcolor=${GREEN}:fontsize=28:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-280:alpha='if(lt(t,0.5),t/0.5,1)'[v]
" -map "[v]" -an -t ${D3B} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 "$TMP/c3b.mp4"
echo ">> c3b done"

# ───────────────────────────────────────────────
# BEAT 4 — Delivery handshake + logo reveal (slow zoom out)
# Captions: DELIVERED. PROTECTED. + GUBER shield
# ───────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$STILL/s4_delivery_handshake.png" -i "$SHIELD" -i "$WM" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='if(lte(on,1),1.18,max(zoom-0.0009,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${F4}:s=${W}x${H}:fps=24[zp];
[1:v]scale=220:-1,format=rgba,colorchannelmixer=aa=0.95[sh];
[2:v]scale=380:-1,format=rgba,colorchannelmixer=aa=0.95[wm];
[zp][sh]overlay=(W-w)/2:H*0.28:enable='gte(t,0.5)'[bs];
[bs][wm]overlay=(W-w)/2:H*0.49:enable='gte(t,0.9)'[bw];
[bw]drawtext=fontfile=${FONT}:text='DELIVERED. PROTECTED.':fontcolor=white:fontsize=46:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-310:alpha='if(lt(t,1.5),0,if(lt(t,2),(t-1.5)/0.5,1))',
drawtext=fontfile=${FONT_REG}:text='GUBER - Move with confidence.':fontcolor=${GREEN}:fontsize=30:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-250:alpha='if(lt(t,2.0),0,if(lt(t,2.5),(t-2.0)/0.5,1))'[v]
" -map "[v]" -an -t ${D4} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 "$TMP/c4.mp4"
echo ">> c4 done"

# ───────────────────────────────────────────────
# CONCAT all clips
# ───────────────────────────────────────────────
printf "file '%s'\n" \
  "$(pwd)/$TMP/c1.mp4" \
  "$(pwd)/$TMP/c2.mp4" \
  "$(pwd)/$TMP/c3a.mp4" \
  "$(pwd)/$TMP/c3b.mp4" \
  "$(pwd)/$TMP/c4.mp4" > "$TMP/list.txt"

ffmpeg -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/video_raw.mp4"
echo ">> concat done"

TOTAL=29.8

# ───────────────────────────────────────────────
# AUDIO — voiceovers + music bed
# vo1@0s, vo2@7s, vo3@14s(across 3a+3b), vo4@23.8s
# ───────────────────────────────────────────────
ffmpeg -y \
  -i "$AUD/music_guber_motivational_bed.mp3" \
  -i "$AUD/vo1.mp3" -i "$AUD/vo2.mp3" \
  -i "$AUD/vo3.mp3" -i "$AUD/vo4.mp3" \
  -filter_complex "
[1:a]volume=1.4,adelay=0|0[a1];
[2:a]volume=1.4,adelay=7000|7000[a2];
[3:a]volume=1.4,adelay=14000|14000[a3];
[4:a]volume=1.4,adelay=23800|23800[a4];
[0:a]volume=0.15,afade=t=in:st=0:d=0.8,afade=t=out:st=28.0:d=1.8[mus];
[a1][a2][a3][a4][mus]amix=inputs=5:duration=longest:normalize=0,alimiter=limit=0.95[aout]
" -map "[aout]" -t ${TOTAL} -c:a aac -b:a 192k "$TMP/audio_mix.m4a"
echo ">> audio done"

# ───────────────────────────────────────────────
# FINAL — fade in/out + mux
# ───────────────────────────────────────────────
ffmpeg -y \
  -i "$TMP/video_raw.mp4" \
  -i "$TMP/audio_mix.m4a" \
  -filter_complex "[0:v]fade=t=in:st=0:d=0.5,fade=t=out:st=29.1:d=0.7[v]" \
  -map "[v]" -map "1:a" -t ${TOTAL} \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 19 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT"

echo ""
echo "✓ BUILT: $OUT"
ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 "$OUT"
