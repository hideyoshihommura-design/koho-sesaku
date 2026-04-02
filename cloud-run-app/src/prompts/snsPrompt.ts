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

// 既知の拠点名リスト（表記ゆれ対応のため正式名称を列挙）
const KNOWN_BRANCHES = [
  'あおぞら博多',
  '七福の里',
  '下荒田',
  '東千石',
  '梅ヶ丘',
];

export function buildSnsPrompt(input: SnsGenerationInput): string {
  return `あなたは介護・デイサービス施設グループ「あおぞら」のSNS担当者として、スタッフから送られた素材をもとにSNS投稿文を作成します。

## スタッフからのコメント
${input.comment}

## 写真の枚数
${input.photoCount}枚

## 指示

以下の点を抽出・判定してください：

1. **拠点名の判別**: コメントに以下の拠点名またはその略称・表記ゆれが含まれている場合、正式名称で抽出してください。含まれていない場合は「未判別」としてください。
   既知の拠点名: ${KNOWN_BRANCHES.join('、')}
   （例：「博多」→「あおぞら博多」、「七福」→「七福の里」、「梅ヶ丘」→「梅ヶ丘」）

2. **顔出しOK判定**: コメントに「顔出しOK」「顔出しok」「顔だしOK」などの記載がある場合は true、ない場合は false としてください。

3. **SNS投稿文の作成**: 以下4つのSNSそれぞれに最適化した投稿文を作成してください。
   - 「あおぞら」グループらしい温かく親しみやすいトーンを維持してください
   - 利用者様と職員の心温まる関わりが伝わる内容にしてください
   - 個人情報（フルネーム等）は含めないでください
   - 写真が複数枚ある場合は枚数を自然に組み込んでください
   - 拠点名が判別できた場合は投稿文に自然に含めてください

**Facebook投稿文**（150〜300文字、です・ます調、ハッシュタグ3〜5個）:
- 施設の日常や取り組みを丁寧に伝える文体
- ご家族や地域の方々に向けた内容
- #あおぞら #介護 #デイサービス 等を含める

**Instagram投稿文**（100〜200文字、親しみやすい文体、絵文字を適度に使用、ハッシュタグ10〜15個）:
- ビジュアル重視、明るく温かい雰囲気
- #あおぞら #介護施設 #デイサービス #福岡介護 等の関連タグを含める

**TikTok投稿文**（50〜100文字、若者にも伝わる軽快な文体、ハッシュタグ3〜5個）:
- 動画映えする内容を意識
- 短く印象的なフレーズ

**X（旧Twitter）投稿文**（140文字以内、簡潔、ハッシュタグ2〜3個）:
- 要点を凝縮して伝える
- 読んだ人が施設に興味を持てる内容

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
