// フローA：記事生成プロンプト

export interface ArticlePromptInput {
  sourceText: string;
  imageDescriptions: string;
  folderName: string;
}

export interface GeneratedArticle {
  title: string;
  content: string;
  metaDescription: string;
  facebookPost: string;
  instagramPost: string;
  tiktokCaption: string;
  lifullPost: string;
}

export function buildArticlePrompt(input: ArticlePromptInput): string {
  return `あなたは介護業界の専門ライターです。
以下の情報をもとに、SEOを意識した記事と各SNS投稿文を生成してください。

【提供情報】
テキスト情報: ${input.sourceText}
画像説明: ${input.imageDescriptions}
素材フォルダ名: ${input.folderName}

【記事作成のルール】
- タイトルは読者が思わずクリックしたくなる、具体的な表現を使うこと
- 本文は介護に関心のある家族・介護者向けに、わかりやすく・温かみのある文体で書くこと
- 見出し（H2・H3）を使って読みやすく構成すること
- SEOキーワードを自然に含めること
- 本文は800〜1500文字を目安とすること

【SNS投稿文のルール】
- Facebook: 親しみやすい文体・URL付き・300文字以内
- Instagram: 共感を呼ぶ文体・ハッシュタグ10個以上・150文字以内（ハッシュタグ別）
- TikTok: 短く引きつける文体・ハッシュタグ5個・100文字以内（ハッシュタグ別）
- LIFULL介護: 正式な文体・施設名や特徴を含む・200文字以内

【出力形式（JSON のみ返すこと）】
{
  "title": "記事タイトル",
  "content": "本文（Markdown形式）",
  "metaDescription": "120文字以内のメタディスクリプション",
  "facebookPost": "300文字以内のFacebook投稿文（URL除く）",
  "instagramPost": "150文字以内の投稿文\\n\\n#ハッシュタグ1 #ハッシュタグ2...",
  "tiktokCaption": "100文字以内のキャプション\\n\\n#ハッシュタグ1...",
  "lifullPost": "200文字以内のLIFULL介護投稿文"
}`;
}

export function parseGeneratedArticle(responseText: string): GeneratedArticle {
  // JSONブロックを抽出
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Gemini のレスポンスからJSONを抽出できませんでした');
  }
  return JSON.parse(jsonMatch[0]) as GeneratedArticle;
}
