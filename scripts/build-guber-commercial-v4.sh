#!/usr/bin/env bash
set -euo pipefail

# ── GUBER Load Board / Asset Protection — TV commercial (v4, real motion video) ──
# Real AI video clips + a clean phone mockup of the ACTUAL GUBER load board app.
# No persistent logo overlay (end card only). Reuses existing VO + music.

FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
WM="client/public/investor/guber-wordmark-green.png"
SHIELD="client/public/investor/guber-shield-gold.png"
SCREEN="attached_assets/_stills2/guber_screen.jpg"
VID="attached_assets/generated_videos"
AUD="attached_assets/generated_audio"
TMP="attached_assets/_tmp_v4"
OUT="attached_assets/guber-loadboard-commercial-v4.mp4"
mkdir -p "$TMP"

GREEN="0x39FF14"
W=1080; H=1920; FPS=30

# clip sources
C1="$VID/driver_checks_phone_hero.mp4"      # 8s  -> use 4s
C2="$VID/hauler_highway_tracking.mp4"        # 8s  -> use 7s
C3="$VID/female_driver_selfie.mp4"           # 6s  -> use 5s
C4="$VID/worker_documents_car.mp4"           # 6s  -> use 5s
C5="$VID/delivery_handshake.mp4"             # 6s  -> use 6s

SCALE="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1"

# ════════════════════════════════════════════════════════════════
# PHONE MOCKUP — real GUBER load board app on a phone screen
# ════════════════════════════════════════════════════════════════
echo ">> building phone mockup"

# 1) crop the app content column out of the real screenshot
convert "$SCREEN" -crop 302x600+6+4 +repage "$TMP/app_crop.png"

# 2) scale to screen width, pad to screen size with app dark bg
convert "$TMP/app_crop.png" -resize 604x "$TMP/app_scaled.png"
convert "$TMP/app_scaled.png" -background "#0a0a0a" -gravity north -extent 604x1284 "$TMP/app_screen.png"

# 3) round the screen corners
convert -size 604x1284 xc:black -fill white -draw "roundrectangle 0,0 603,1283 46,46" "$TMP/screen_mask.png"
convert "$TMP/app_screen.png" "$TMP/screen_mask.png" -alpha off -compose CopyOpacity -composite "$TMP/app_round.png"

# 4) phone body (dark rounded slab + subtle bezel)
convert -size 640x1320 xc:none -fill "#060606" -draw "roundrectangle 0,0 639,1319 64,64" "$TMP/phone_body.png"
convert "$TMP/phone_body.png" -fill none -stroke "#242424" -strokewidth 3 -draw "roundrectangle 2,2 637,1317 62,62" "$TMP/phone_body.png"

# 5) screen into body (18px bezel) + camera notch
convert "$TMP/phone_body.png" "$TMP/app_round.png" -geometry +18+18 -compose over -composite "$TMP/phone_ws.png"
convert "$TMP/phone_ws.png" -fill "#000000" -draw "roundrectangle 282,32 358,52 10,10" "$TMP/phone_notch.png"
convert "$TMP/phone_notch.png" -fill "#10330f" -draw "circle 348,42 351,42" "$TMP/phone_dev.png"

# 6) blurred, darkened highway frame as backdrop
ffmpeg -y -ss 4 -i "$C2" -frames:v 1 \
  -vf "${SCALE},boxblur=26:3,eq=brightness=-0.32:saturation=0.75" "$TMP/bg.png" 2>/dev/null

# 7) phone drop shadow, composite onto backdrop
convert "$TMP/phone_dev.png" \( +clone -background black -shadow 70x40+0+22 \) +swap -background none -layers merge +repage "$TMP/phone_shadow.png"
convert "$TMP/bg.png" "$TMP/phone_shadow.png" -gravity center -geometry +0-12 -compose over -composite "$TMP/phone_mock.png"

# 8) animate: slow push-in + caption
ffmpeg -y -loop 1 -i "$TMP/phone_mock.png" -filter_complex "
[0:v]scale=1296:2304,zoompan=z='min(zoom+0.0007,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=${W}x${H}:fps=${FPS}[zp];
[zp]drawtext=fontfile=${FONT}:text='THE LOAD BOARD':fontcolor=white:fontsize=72:borderw=5:bordercolor=black@0.85:x=(w-text_w)/2:y=h-380:alpha='if(lt(t,0.4),t/0.4,1)',
drawtext=fontfile=${FONT_REG}:text='Post a load. Verified haulers near you.':fontcolor=${GREEN}:fontsize=40:borderw=4:bordercolor=black@0.85:x=(w-text_w)/2:y=h-300:alpha='if(lt(t,0.6),t/0.6,1)'[v]
" -map "[v]" -an -t 3 -r ${FPS} -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 "$TMP/seg2.mp4"
echo ">> seg2 (app mockup) done"

# ════════════════════════════════════════════════════════════════
# CAPTION HELPER — encode one clip segment with lower-third captions
#   args: in_file  out_file  duration  HEADLINE  subline
# ════════════════════════════════════════════════════════════════
seg() {
  local IN="$1" OUTF="$2" DUR="$3" HEAD="$4" SUB="$5"
  ffmpeg -y -i "$IN" -filter_complex "
[0:v]fps=${FPS},${SCALE},
drawtext=fontfile=${FONT}:text='${HEAD}':fontcolor=white:fontsize=72:borderw=5:bordercolor=black@0.85:x=(w-text_w)/2:y=h-380:alpha='if(lt(t,0.4),t/0.4,1)',
drawtext=fontfile=${FONT_REG}:text='${SUB}':fontcolor=${GREEN}:fontsize=40:borderw=4:bordercolor=black@0.85:x=(w-text_w)/2:y=h-300:alpha='if(lt(t,0.6),t/0.6,1)'[v]
" -map "[v]" -an -t "$DUR" -r ${FPS} -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 "$OUTF"
  echo ">> ${OUTF} done"
}

seg "$C1" "$TMP/seg1.mp4" 4 "GUBER LOAD BOARD" "Move anything. Trust every mile."
seg "$C2" "$TMP/seg3.mp4" 7 "ASSET PROTECTION" "Your cargo deserves more than a handshake."
seg "$C3" "$TMP/seg4.mp4" 5 "VERIFIED AT PICKUP" "Driver selfie. GPS-confirmed location."
seg "$C4" "$TMP/seg5.mp4" 5 "FULLY DOCUMENTED" "Tow, trailer and VIN - locked on record."

# ── Final beat: delivery + end-card logo reveal ──
ffmpeg -y -i "$C5" -loop 1 -i "$SHIELD" -loop 1 -i "$WM" -filter_complex "
[0:v]fps=${FPS},${SCALE}[base];
[1:v]scale=300:-1,format=rgba,fade=t=in:st=3.2:d=0.6:alpha=1[sh];
[2:v]scale=560:-1,format=rgba,fade=t=in:st=3.6:d=0.6:alpha=1[wm];
[base][sh]overlay=(W-w)/2:H*0.24[b1];
[b1][wm]overlay=(W-w)/2:H*0.40[b2];
[b2]drawtext=fontfile=${FONT}:text='DELIVERED. PROTECTED.':fontcolor=white:fontsize=66:borderw=5:bordercolor=black@0.85:x=(w-text_w)/2:y=h-380:alpha='if(lt(t,0.4),t/0.4,1)',
drawtext=fontfile=${FONT_REG}:text='GUBER - Move with confidence.':fontcolor=${GREEN}:fontsize=42:borderw=4:bordercolor=black@0.85:x=(w-text_w)/2:y=h-300:alpha='if(lt(t,4.2),0,if(lt(t,4.8),(t-4.2)/0.6,1))'[v]
" -map "[v]" -an -t 6 -r ${FPS} -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 "$TMP/seg6.mp4"
echo ">> seg6 (delivery + end card) done"

# ── Concat (order: driver, app mockup, highway, selfie, doc, delivery) ──
printf "file '%s'\n" \
  "$(pwd)/$TMP/seg1.mp4" "$(pwd)/$TMP/seg2.mp4" \
  "$(pwd)/$TMP/seg3.mp4" "$(pwd)/$TMP/seg4.mp4" \
  "$(pwd)/$TMP/seg5.mp4" "$(pwd)/$TMP/seg6.mp4" > "$TMP/list.txt"
ffmpeg -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/video_raw.mp4"
echo ">> concat done"

TOTAL=30.0

# ── Audio mix (same VO timing as before: 0 / 7 / 14 / 23.8) ──
ffmpeg -y \
  -i "$AUD/music_guber_motivational_bed.mp3" \
  -i "$AUD/vo1.mp3" -i "$AUD/vo2.mp3" \
  -i "$AUD/vo3.mp3" -i "$AUD/vo4.mp3" \
  -filter_complex "
[1:a]volume=1.4,adelay=0|0[a1];
[2:a]volume=1.4,adelay=7000|7000[a2];
[3:a]volume=1.4,adelay=14000|14000[a3];
[4:a]volume=1.4,adelay=23800|23800[a4];
[0:a]volume=0.16,afade=t=in:st=0:d=0.8,afade=t=out:st=28.2:d=1.6[mus];
[a1][a2][a3][a4][mus]amix=inputs=5:duration=longest:normalize=0,alimiter=limit=0.95[aout]
" -map "[aout]" -t ${TOTAL} -c:a aac -b:a 192k "$TMP/audio_mix.m4a"
echo ">> audio done"

# ── Final mux + global fade in/out ──
ffmpeg -y \
  -i "$TMP/video_raw.mp4" -i "$TMP/audio_mix.m4a" \
  -filter_complex "[0:v]fade=t=in:st=0:d=0.5,fade=t=out:st=29.3:d=0.7[v]" \
  -map "[v]" -map "1:a" -t ${TOTAL} \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 -movflags +faststart \
  -c:a aac -b:a 192k "$OUT"

echo ""
echo "✓ BUILT: $OUT"
ffprobe -v error -show_entries format=duration:stream=width,height -of default=noprint_wrappers=1 "$OUT"
