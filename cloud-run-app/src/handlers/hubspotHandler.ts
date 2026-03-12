import axios from 'axios';
import { logger } from '../utils/logger';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

// HubSpot Social API でFacebookに投稿
export async function postFacebook(message: string, articleUrl: string): Promise<void> {
  logger.info('HubSpot: Facebook投稿開始', { flow: 'B', platform: 'Facebook' });

  const token = await getSecret(SECRET_NAMES.HUBSPOT_ACCESS_TOKEN);
  const channelAccountId = process.env.HUBSPOT_FACEBOOK_CHANNEL_ID!;

  await axios.post(
    `${HUBSPOT_API_BASE}/broadcast/v1/broadcasts`,
    {
      channelGuid: channelAccountId,
      triggerAt: new Date().toISOString(),
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

  logger.info('HubSpot: Facebook投稿完了', { platform: 'Facebook' });
}

// HubSpot Social API でInstagramに投稿
export async function postInstagram(caption: string, imageUrl: string): Promise<void> {
  logger.info('HubSpot: Instagram投稿開始', { flow: 'B', platform: 'Instagram' });

  const token = await getSecret(SECRET_NAMES.HUBSPOT_ACCESS_TOKEN);
  const channelAccountId = process.env.HUBSPOT_INSTAGRAM_CHANNEL_ID!;

  await axios.post(
    `${HUBSPOT_API_BASE}/broadcast/v1/broadcasts`,
    {
      channelGuid: channelAccountId,
      triggerAt: new Date().toISOString(),
      content: {
        body: caption,
        photoUrl: imageUrl,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info('HubSpot: Instagram投稿完了', { platform: 'Instagram' });
}
