// Remotion スライドショー合成
// 画像を順番にフェードイン/アウトする縦型動画（9:16）を生成
// 字幕（Instagram投稿文）と BGM を追加

import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';

// ─────────────────────────────────────────
// スライド画像（フェードイン/アウト付き）
// ─────────────────────────────────────────
const SlideImage: React.FC<{
  src: string;
  durationInFrames: number;
  transitionFrames: number;
}> = ({ src, durationInFrames, transitionFrames }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, transitionFrames, durationInFrames - transitionFrames, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={src}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────
// 字幕オーバーレイ（画面下部・グラデーション背景）
// ─────────────────────────────────────────
const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();

  // 最初の 30 フレーム（1秒）でフェードイン
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ハッシュタグ以降は除いて本文のみ表示（最大 80 文字）
  const bodyText = text.split('#')[0].trim();
  const displayText = bodyText.length > 80 ? bodyText.substring(0, 80) + '…' : bodyText;

  if (!displayText) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'stretch',
        opacity,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.72))',
          padding: '48px 40px 60px',
          color: '#ffffff',
          fontSize: 38,
          fontFamily: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif',
          fontWeight: 500,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          textShadow: '0 2px 8px rgba(0,0,0,0.6)',
        }}
      >
        {displayText}
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────
// メイン合成
// ─────────────────────────────────────────
export interface SlideshowProps {
  imageDataUrls: string[];
  captionText: string;          // Instagram 投稿文（字幕に使用）
  musicFile: string;            // public/music/ 配下の BGM ファイル名
  frameDuration?: number;       // 1枚あたりのフレーム数（デフォルト 150 = 5秒 @ 30fps）
  transitionFrames?: number;    // フェード時間（デフォルト 15 = 0.5秒）
}

export const Slideshow: React.FC<SlideshowProps> = ({
  imageDataUrls,
  captionText,
  musicFile,
  frameDuration = 150,
  transitionFrames = 15,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* BGM（音量 40%） */}
      {musicFile && (
        <Audio
          src={staticFile(`music/${musicFile}`)}
          volume={0.4}
          startFrom={0}
        />
      )}

      {/* スライド画像 */}
      {imageDataUrls.map((src, i) => (
        <Sequence
          key={i}
          from={i * frameDuration}
          durationInFrames={frameDuration + transitionFrames}
        >
          <SlideImage
            src={src}
            durationInFrames={frameDuration + transitionFrames}
            transitionFrames={transitionFrames}
          />
        </Sequence>
      ))}

      {/* 字幕（全スライドを通して表示） */}
      <Caption text={captionText} />
    </AbsoluteFill>
  );
};
