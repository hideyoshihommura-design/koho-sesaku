#!/bin/bash
# ─────────────────────────────────────────────────────────────
# BGM 自動生成スクリプト
# ffmpeg の音声合成フィルターを使って 3 種類の BGM を生成する
# Docker ビルド時（Remotion バンドル前）に実行される
#
# 生成物:
#   public/music/bgm1.mp3  ─ 明るい Cメジャー（明るい投稿向け）
#   public/music/bgm2.mp3  ─ 温かい Fメジャー（行事・活動向け）
#   public/music/bgm3.mp3  ─ 穏やか Aマイナー（日常・安らぎ向け）
# ─────────────────────────────────────────────────────────────
set -e

MUSIC_DIR="public/music"
mkdir -p "$MUSIC_DIR"

echo "▶ BGM1 を生成中（明るい Cメジャーコード）..."
# C4=261.63Hz  E4=329.63Hz  G4=392.00Hz  C5=523.25Hz
ffmpeg -y -loglevel error \
  -f lavfi -i "sine=frequency=261.63:sample_rate=44100" \
  -f lavfi -i "sine=frequency=329.63:sample_rate=44100" \
  -f lavfi -i "sine=frequency=392.00:sample_rate=44100" \
  -f lavfi -i "sine=frequency=523.25:sample_rate=44100" \
  -filter_complex "
    [0]volume=0.20[a];
    [1]volume=0.16[b];
    [2]volume=0.16[c];
    [3]volume=0.10[d];
    [a][b][c][d]amix=inputs=4:normalize=0,
    atremolo=f=0.8:d=0.25,
    aecho=0.8:0.7:80:0.35,
    afade=t=in:st=0:d=3,
    afade=t=out:st=27:d=3
  " \
  -t 30 \
  "$MUSIC_DIR/bgm1.mp3"
echo "  ✅ bgm1.mp3"

echo "▶ BGM2 を生成中（温かい Fメジャーコード）..."
# F4=349.23Hz  A4=440.00Hz  C5=523.25Hz  F5=698.46Hz
ffmpeg -y -loglevel error \
  -f lavfi -i "sine=frequency=349.23:sample_rate=44100" \
  -f lavfi -i "sine=frequency=440.00:sample_rate=44100" \
  -f lavfi -i "sine=frequency=523.25:sample_rate=44100" \
  -f lavfi -i "sine=frequency=698.46:sample_rate=44100" \
  -filter_complex "
    [0]volume=0.20[a];
    [1]volume=0.16[b];
    [2]volume=0.16[c];
    [3]volume=0.08[d];
    [a][b][c][d]amix=inputs=4:normalize=0,
    atremolo=f=0.6:d=0.20,
    aecho=0.8:0.8:120:0.45,
    afade=t=in:st=0:d=4,
    afade=t=out:st=26:d=4
  " \
  -t 30 \
  "$MUSIC_DIR/bgm2.mp3"
echo "  ✅ bgm2.mp3"

echo "▶ BGM3 を生成中（穏やか Aマイナーコード）..."
# A3=220.00Hz  C4=261.63Hz  E4=329.63Hz  A4=440.00Hz
ffmpeg -y -loglevel error \
  -f lavfi -i "sine=frequency=220.00:sample_rate=44100" \
  -f lavfi -i "sine=frequency=261.63:sample_rate=44100" \
  -f lavfi -i "sine=frequency=329.63:sample_rate=44100" \
  -f lavfi -i "sine=frequency=440.00:sample_rate=44100" \
  -filter_complex "
    [0]volume=0.18[a];
    [1]volume=0.15[b];
    [2]volume=0.15[c];
    [3]volume=0.10[d];
    [a][b][c][d]amix=inputs=4:normalize=0,
    atremolo=f=0.4:d=0.30,
    aecho=0.9:0.8:150:0.50,
    afade=t=in:st=0:d=5,
    afade=t=out:st=25:d=5
  " \
  -t 30 \
  "$MUSIC_DIR/bgm3.mp3"
echo "  ✅ bgm3.mp3"

echo "✅ BGM 生成完了（3ファイル → $MUSIC_DIR/）"
