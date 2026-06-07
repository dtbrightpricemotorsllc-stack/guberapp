#!/usr/bin/env bash
set -euo pipefail

FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
WM="client/public/investor/guber-wordmark-green.png"
SHIELD="client/public/investor/guber-shield-gold.png"
S="attached_assets/_stills2"
AUD="attached_assets/generated_audio"
TMP="attached_assets/_tmp_v3"
OUT="attached_assets/guber-loadboard-commercial-v3.mp4"
mkdir -p "$TMP"

GREEN="0x39FF14"
W=720; H=1280

D1=7.0; D2=7.0; D3A=4.9; D3B=4.9; D4=6.0
F1=168; F2=168; F3A=118; F3B=118; F4=144

PRESCALE="scale=900:1600:force_original_aspect_ratio=increase,crop=900:1600,setsar=1"

# Crop GUBER screen (1280x720 landscape) → left 390px → scale to phone insert size
# Phone insert: 230w x 496h displayed in video
ffmpeg -y -i "$S/guber_screen.jpg" \
  -filter_complex "[0:v]crop=390:720:0:0,scale=230:496[screen]" \
  -map "[screen]" "$TMP/guber_screen_crop.png" 2>/dev/null
echo ">> screen crop done"

# ────────────────────────────────────────────
# BEAT 1 — Semi driver checking load board
# GUBER phone screen floats in lower portion
# ────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$S/s1_driver_semi.png" -i "$WM" -i "$TMP/guber_screen_crop.png" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='min(zoom+0.0007,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${F1}:s=${W}x${H}:fps=24[zp];
[1:v]scale=280:-1,format=rgba,colorchannelmixer=aa=0.92[wm];
[zp][wm]overlay=(W-w)/2:72[bw];
[2:v]format=rgba,colorchannelmixer=aa=0.92[sc];
[bw][sc]overlay=(W-w)/2:720:enable='gte(t,1.2)'[bo];
[bo]drawtext=fontfile=${FONT}:text='GUBER LOAD BOARD':fontcolor=white:fontsize=50:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-660:alpha='if(lt(t,0.4),t/0.4,1)',
drawtext=fontfile=${FONT_REG}:text='Post a load. Verified haulers near you.':fontcolor=${GREEN}:fontsize=27:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-600:alpha='if(lt(t,0.6),t/0.6,1)'[v]
" -map "[v]" -an -t ${D1} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 19 "$TMP/c1.mp4"
echo ">> c1 done"

# ────────────────────────────────────────────
# BEAT 2 — Peterbilt + Lambos on highway
# Slow pan left to right reveals full hauler
# ────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$S/s2_hauler_highway.png" -i "$WM" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='1.12':x='min(iw/zoom/2+on*0.6,iw-iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${F2}:s=${W}x${H}:fps=24[zp];
[1:v]scale=280:-1,format=rgba,colorchannelmixer=aa=0.92[wm];
[zp][wm]overlay=(W-w)/2:72[bw];
[bw]drawtext=fontfile=${FONT}:text='ASSET PROTECTION':fontcolor=white:fontsize=52:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-360:alpha='if(lt(t,0.4),t/0.4,1)',
drawtext=fontfile=${FONT_REG}:text='Your cargo deserves more than a handshake.':fontcolor=${GREEN}:fontsize=27:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-290:alpha='if(lt(t,0.6),t/0.6,1)'[v]
" -map "[v]" -an -t ${D2} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 19 "$TMP/c2.mp4"
echo ">> c2 done"

# ────────────────────────────────────────────
# BEAT 3A — Female driver selfie verification
# Zoom in on face + hauler background
# ────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$S/s3a_selfie.png" -i "$WM" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='max(ih*0.20-(ih/zoom/2),0)':d=${F3A}:s=${W}x${H}:fps=24[zp];
[1:v]scale=280:-1,format=rgba,colorchannelmixer=aa=0.92[wm];
[zp][wm]overlay=(W-w)/2:72[bw];
[bw]drawtext=fontfile=${FONT}:text='VERIFIED AT PICKUP':fontcolor=white:fontsize=48:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-360:alpha='if(lt(t,0.3),t/0.3,1)',
drawtext=fontfile=${FONT_REG}:text='Driver selfie. GPS-confirmed location.':fontcolor=${GREEN}:fontsize=28:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-290:alpha='if(lt(t,0.4),t/0.4,1)'[v]
" -map "[v]" -an -t ${D3A} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 19 "$TMP/c3a.mp4"
echo ">> c3a done"

# ────────────────────────────────────────────
# BEAT 3B — VIN photo on Lamborghini
# Slow zoom into documentation moment
# ────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$S/s3b_vin_lambo.png" -i "$WM" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='min(zoom+0.0015,1.25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${F3B}:s=${W}x${H}:fps=24[zp];
[1:v]scale=280:-1,format=rgba,colorchannelmixer=aa=0.92[wm];
[zp][wm]overlay=(W-w)/2:72[bw];
[bw]drawtext=fontfile=${FONT}:text='EQUIPMENT DOCUMENTED':fontcolor=white:fontsize=44:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-360:alpha='if(lt(t,0.3),t/0.3,1)',
drawtext=fontfile=${FONT_REG}:text='Tow, trailer and VIN - locked on record.':fontcolor=${GREEN}:fontsize=27:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-290:alpha='if(lt(t,0.4),t/0.4,1)'[v]
" -map "[v]" -an -t ${D3B} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 19 "$TMP/c3b.mp4"
echo ">> c3b done"

# ────────────────────────────────────────────
# BEAT 4 — Lambo delivery handshake + logo reveal
# Slow zoom out, shield + wordmark fade in
# ────────────────────────────────────────────
ffmpeg -y -loop 1 -i "$S/s4_delivery.png" -i "$SHIELD" -i "$WM" \
  -filter_complex "
[0:v]${PRESCALE}[pre];
[pre]zoompan=z='if(lte(on,1),1.18,max(zoom-0.0009,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${F4}:s=${W}x${H}:fps=24[zp];

[1:v]scale=200:-1,format=rgba,colorchannelmixer=aa=0.95[sh];

[2:v]scale=360:-1,format=rgba,colorchannelmixer=aa=0.95[wm];
[zp][sh]overlay=(W-w)/2:H*0.29[bs];
[bs][wm]overlay=(W-w)/2:H*0.49[bw];
[bw]drawtext=fontfile=${FONT}:text='DELIVERED. PROTECTED.':fontcolor=white:fontsize=46:borderw=5:bordercolor=black@0.9:x=(w-text_w)/2:y=h-310:alpha='if(lt(t,1.8),0,if(lt(t,2.3),(t-1.8)/0.5,1))',
drawtext=fontfile=${FONT_REG}:text='GUBER - Move with confidence.':fontcolor=${GREEN}:fontsize=30:borderw=4:bordercolor=black@0.9:x=(w-text_w)/2:y=h-255:alpha='if(lt(t,2.3),0,if(lt(t,2.8),(t-2.3)/0.5,1))'[v]
" -map "[v]" -an -t ${D4} -r 24 -c:v libx264 -pix_fmt yuv420p -preset fast -crf 19 "$TMP/c4.mp4"
echo ">> c4 done"

# ── Concat ──
printf "file '%s'\n" \
  "$(pwd)/$TMP/c1.mp4" "$(pwd)/$TMP/c2.mp4" \
  "$(pwd)/$TMP/c3a.mp4" "$(pwd)/$TMP/c3b.mp4" \
  "$(pwd)/$TMP/c4.mp4" > "$TMP/list.txt"
ffmpeg -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/video_raw.mp4"
echo ">> concat done"

TOTAL=29.8

# ── Audio mix ──
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

# ── Final mux + fade in/out ──
ffmpeg -y \
  -i "$TMP/video_raw.mp4" -i "$TMP/audio_mix.m4a" \
  -filter_complex "[0:v]fade=t=in:st=0:d=0.5,fade=t=out:st=29.1:d=0.7[v]" \
  -map "[v]" -map "1:a" -t ${TOTAL} \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT"

echo ""
echo "✓ BUILT: $OUT"
ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 "$OUT"
