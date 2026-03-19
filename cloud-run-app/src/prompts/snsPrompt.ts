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
  tiktokCaption: string;
}

export function buildSNSPrompt(input: SNSPromptInput): string {
  return `以下のWordPress記事をもとに、各SNSに最適化した投稿文を生成してください。
記事の内容を変えず、各プラットフォームのトーン・文字数に合わせること。

【記事タイトル】
${input.title}

【記事の抜粋・本文（冒頭500文字）】
${(input.excerpt || input.content).slice(0, 500)}

【記事URL】
${input.url}

【各SNS投稿文のルール】
- Facebook: 親しみやすい文体、記事の要点を伝える、最後にURL付き、300文字以内
- Instagram: 共感を呼ぶ文体、絵文字を使って読みやすく、ハッシュタグ10個以上、本文150文字以内
- TikTok: 短く引きつける一言、若い世代にも伝わる表現、ハッシュタグ5個、100文字以内

【出力形式（JSON のみ返すこと）】
{
  "facebookPost": "300文字以内の投稿文（URLを末尾に含める）: ${input.url}",
  "instagramPost": "150文字以内の投稿文\\n\\n#介護 #老人ホーム #ハッシュタグ...",
  "tiktokCaption": "100文字以内のキャプション\\n\\n#介護 #ハッシュタグ..."
}`;
}

export function parseGeneratedSNSPosts(responseText: string): GeneratedSNSPosts {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude のレスポンスからJSONを抽出できませんでした');
  }
  return JSON.parse(jsonMatch[0]) as GeneratedSNSPosts;
}
