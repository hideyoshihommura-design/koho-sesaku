// Docker ビルド時にのみ実行するスクリプト。
// Remotion 合成を webpack でバンドルし dist/video-bundle/ に出力する。
// 実行: ts-node src/video/bundle.ts

import { bundle } from '@remotion/bundler';
import * as path from 'path';

async function main() {
  console.log('Remotion バンドルを作成中...');

  const bundlePath = await bundle({
    entryPoint: path.resolve(__dirname, 'index.tsx'),
    outDir: path.resolve(__dirname, '../../dist/video-bundle'),
  });

  console.log('バンドル完了:', bundlePath);
}

main().catch((err) => {
  console.error('バンドルに失敗しました:', err);
  process.exit(1);
});
