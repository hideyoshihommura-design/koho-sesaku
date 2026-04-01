// SNS 投稿文生成プロンプト

export interface SnsGenerationInput {
  comment: string;        // スタッフのコメント
  photoCount: number;     // 写真の枚数
  branchHint?: string;    // コメントから拾った拠点名のヒント（あれば）
}

export interface SnsGenerationOutput {
  detectedBranch: string;        // 判別した拠点名（不明なら「未判別」）
  hasFacePermission: boolean;    // 顔出しOKの記載があるか
  facebook: string;
  instagram: string;
  tiktok: string;
  x: string;
}

export function buildSnsPrompt(input: SnsGenerationInput): string {
  return `あなたは介護施設のSNS担当者として、スタッフから送られた素材をもとにSNS投稿文を作成します。

## スタッフからのコメント
${input.comment}

## 写真の枚数
${input.photoCount}枚

## 指示

以下の点を抽出・判定してください：

1. **拠点名の判別**: コメントに施設名・拠点名（例：四元、あおぞら博多、野芥 など）が含まれている場合、その名前を抽出してください。含まれていない場合は「未判別」としてください。

2. **顔出しOK判定**: コメントに「顔出しOK」「顔出しok」「顔だしOK」などの記載がある場合は true、ない場合は false としてください。

3. **SNS投稿文の作成**: 以下4つのSNSそれぞれに最適化した投稿文を作成してください。
   - 施設の温かい雰囲気・利用者と職員の関わりが伝わる内容にしてください
   - 個人情報（フルネーム等）は含めないでください
   - 写真が複数枚ある場合は「写真${input.photoCount}枚」を自然に組み込んでください

**Facebook投稿文**（150〜300文字、です・ます調、ハッシュタグ3〜5個）:
- 施設の日常や取り組みを丁寧に伝える文体
- 家族や地域の方々に向けた内容

**Instagram投稿文**（100〜200文字、親しみやすい文体、絵文字を適度に使用、ハッシュタグ10〜15個）:
- ビジュアル重視、明るい雰囲気
- #介護 #介護施設 #デイサービス 等の関連タグを含める

**TikTok投稿文**（50〜100文字、若者にも伝わる軽快な文体、ハッシュタグ3〜5個）:
- 動画映えする内容を意識
- 短く印象的なフレーズ

**X（旧Twitter）投稿文**（140文字以内、簡潔、ハッシュタグ2〜3個）:
- 要点を凝縮して伝える
- リツイートされやすい内容

## 出力形式

必ず以下のJSON形式で出力してください：

\`\`\`json
{
  "detectedBranch": "拠点名または未判別",
  "hasFacePermission": true/false,
  "facebook": "Facebook投稿文をここに",
  "instagram": "Instagram投稿文をここに",
  "tiktok": "TikTok投稿文をここに",
  "x": "X投稿文をここに"
}
\`\`\``;
}
