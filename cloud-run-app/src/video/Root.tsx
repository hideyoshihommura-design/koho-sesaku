// Remotion ルート — 合成（Composition）を登録する

import React from 'react';
import { Composition } from 'remotion';
import { Slideshow, SlideshowProps } from './Slideshow';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 縦型 9:16（Instagram Reels / TikTok 推奨サイズ） */}
      <Composition
        id="Slideshow"
        component={Slideshow}
        durationInFrames={150}  // ビルド時のデフォルト値。実際は renderMedia で上書き
        fps={30}
        width={1080}
        height={1920}
        defaultProps={
          {
            imageDataUrls: [],
            captionText: '',
            musicFile: 'bgm1.mp3',
            frameDuration: 150,
            transitionFrames: 15,
          } satisfies SlideshowProps
        }
      />
    </>
  );
};
