// Remotion スライドショー合成
// 画像を順番にフェードイン/アウトする縦型動画（9:16）を生成

import React from 'react';
import { AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame } from 'remotion';

interface SlideImageProps {
  src: string;
  durationInFrames: number;
  transitionFrames: number;
}

const SlideImage: React.FC<SlideImageProps> = ({ src, durationInFrames, transitionFrames }) => {
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
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </AbsoluteFill>
  );
};

export interface SlideshowProps {
  imageDataUrls: string[];
  frameDuration?: number;     // 1枚あたりのフレーム数（デフォルト 90 = 3秒 @ 30fps）
  transitionFrames?: number;  // フェード時間（デフォルト 15 = 0.5秒）
}

export const Slideshow: React.FC<SlideshowProps> = ({
  imageDataUrls,
  frameDuration = 90,
  transitionFrames = 15,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
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
    </AbsoluteFill>
  );
};
