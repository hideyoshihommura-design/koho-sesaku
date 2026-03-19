// フローB：SNS投稿文最適化プロンプト

export interface SNSPromptInput {
  title: string;
  content: string;
  url: string;
  excerpt?: string;
}

export interface GeneratedSNSPosts {
  facebookPost: string;
  instagramPost: string;
  xPost: string;
  tiktokCaption: string;
}

export function buildSNSPrompt(input: SNSPromptInput): string {
  return `以下の記事内容を、各SNSの文字数・形式に合わせて整形してください。
記事の内容・表現・ニュアンスは一切変えないこと。要約や言い換えはしないこと。

【記事タイトル】
${input.title}

【記事の抜粋・本文（冒頭500文字）】
${(input.excerpt || input.content).slice(0, 500)}

【記事URL】
${input.url}

【各SNSの形式ルール（内容は変えず形式のみ調整すること）】
- Facebook: 記事タイトルと本文の冒頭をそのまま使用、最後にURL付き、300文字以内
- Instagram: 記事タイトルと本文の冒頭をそのまま使用、改行で読みやすく整形、ハッシュタグ5〜10個を末尾に追加、本文150文字以内
- X（旧Twitter）: 記事タイトルをそのまま使用、URL付き、ハッシュタグ2〜3個を末尾に追加、URL込みで140文字以内
- TikTok: 記事タイトルをそのまま使用、ハッシュタグ3〜5個を末尾に追加、100文字以内

【出力形式（JSON のみ返すこと）】
{
  "facebookPost": "記事の内容そのまま（URLを末尾に含める）: ${input.url}",
  "instagramPost": "記事の内容そのまま\\n\\n#ハッシュタグ1 #ハッシュタグ2...",
  "xPost": "記事タイトルそのまま ${input.url} #ハッシュタグ",
  "tiktokCaption": "記事タイトルそのまま\\n\\n#ハッシュタグ1..."
}`;
}

export function parseGeneratedSNSPosts(responseText: string): GeneratedSNSPosts {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Gemini のレスポンスからJSONを抽出できませんでした');
  }
  return JSON.parse(jsonMatch[0]) as GeneratedSNSPosts;
}
