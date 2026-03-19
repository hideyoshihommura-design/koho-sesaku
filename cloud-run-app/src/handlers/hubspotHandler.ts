import axios from 'axios';
import { logger } from '../utils/logger';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

// HubSpot Social API でFacebookに投稿
export async function postFacebook(message: string, articleUrl: string): Promise<void> {
  logger.info('HubSpot: Facebook下書き保存開始', { flow: 'B', platform: 'Facebook' });

  const token = await getSecret(SECRET_NAMES.HUBSPOT_ACCESS_TOKEN);
  const channelAccountId = process.env.HUBSPOT_FACEBOOK_CHANNEL_ID!;

  const response = await axios.post(
    `${HUBSPOT_API_BASE}/broadcast/v1/broadcasts`,
    {
      channelGuid: channelAccountId,
      content: {
        body: `${message}\n\n${articleUrl}`,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info('HubSpot: Facebook下書き保存完了', {
    platform: 'Facebook',
    broadcastId: response.data.broadcastGuid,
  });
}

// HubSpot Social API でInstagramに投稿
export async function postInstagram(caption: string, imageUrl: string): Promise<void> {
  logger.info('HubSpot: Instagram下書き保存開始', { flow: 'B', platform: 'Instagram' });

  const token = await getSecret(SECRET_NAMES.HUBSPOT_ACCESS_TOKEN);
  const channelAccountId = process.env.HUBSPOT_INSTAGRAM_CHANNEL_ID!;

  const body: Record<string, unknown> = {
    channelGuid: channelAccountId,
    triggerAt: new Date().toISOString(),
    content: { body: caption },
  };

  // Instagramは画像必須。なければスキップ
  if (!imageUrl) {
    logger.warn('Instagram: アイキャッチ画像がないため投稿をスキップします', { platform: 'Instagram' });
    return;
  }
  body.content = { body: caption, photoUrl: imageUrl };

  const response = await axios.post(
    `${HUBSPOT_API_BASE}/broadcast/v1/broadcasts`,
    body,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info('HubSpot: Instagram下書き保存完了', {
    platform: 'Instagram',
    broadcastId: response.data.broadcastGuid,
  });
}

// HubSpot Social API で X（旧Twitter）に投稿
export async function postX(message: string, articleUrl: string): Promise<void> {
  logger.info('HubSpot: X投稿開始', { flow: 'B', platform: 'X' });

  const token = await getSecret(SECRET_NAMES.HUBSPOT_ACCESS_TOKEN);
  const channelAccountId = process.env.HUBSPOT_X_CHANNEL_ID!;

  const response = await axios.post(
    `${HUBSPOT_API_BASE}/broadcast/v1/broadcasts`,
    {
      channelGuid: channelAccountId,
      content: {
        body: `${message}\n\n${articleUrl}`,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info('HubSpot: X投稿完了', {
    platform: 'X',
    broadcastId: response.data.broadcastGuid,
  });
}

// HubSpot Social API で TikTok に動画投稿
export async function postTikTok(caption: string, videoPublicUrl: string): Promise<void> {
  logger.info('HubSpot: TikTok投稿開始', { flow: 'B', platform: 'TikTok' });

  const token = await getSecret(SECRET_NAMES.HUBSPOT_ACCESS_TOKEN);
  const channelAccountId = process.env.HUBSPOT_TIKTOK_CHANNEL_ID!;

  const response = await axios.post(
    `${HUBSPOT_API_BASE}/broadcast/v1/broadcasts`,
    {
      channelGuid: channelAccountId,
      content: {
        body: caption,
        videoUrl: videoPublicUrl,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info('HubSpot: TikTok投稿完了', {
    platform: 'TikTok',
    broadcastId: response.data.broadcastGuid,
  });
}

// HubSpot に接続済みのSNSチャンネル一覧を確認する（セットアップ時に使用）
export async function listChannels(): Promise<void> {
  const token = await getSecret(SECRET_NAMES.HUBSPOT_ACCESS_TOKEN);
  const response = await axios.get(
    `${HUBSPOT_API_BASE}/broadcast/v1/channels/setting/publish/current`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log('HubSpot接続済みチャンネル:');
  for (const ch of response.data) {
    console.log(`  ${ch.accountType}: channelGuid=${ch.channelGuid} name=${ch.name}`);
  }
}
