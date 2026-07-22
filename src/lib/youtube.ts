import { google } from "googleapis";
import type { ChannelRecord } from "./db";

export class QuotaExceededError extends Error {
  partialItems: ChannelRecord[];

  constructor(message = "YouTube API quota exceeded.", partialItems: ChannelRecord[] = []) {
    super(message);
    this.name = "QuotaExceededError";
    this.partialItems = partialItems;
  }
}

export function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  if (err.name === "QuotaExceededError") return true;
  if (Array.isArray(err.errors) && err.errors.some((e: any) => e.reason === "quotaExceeded")) return true;
  const msg = String(err.message || "").toLowerCase();
  return msg.includes("quotaexceeded") || msg.includes("quota exceeded") || msg.includes("exceeded your quota");
}

export function mapSubscriptionToChannelRecord(item: any, syncTimestamp: string): ChannelRecord | null {
  const subscriptionId = item.id;
  const channelId = item.snippet?.resourceId?.channelId;
  const title = item.snippet?.title;

  if (!subscriptionId || !channelId || !title) {
    return null;
  }

  const description = item.snippet?.description || null;
  const thumbnails = item.snippet?.thumbnails;
  const thumbnailUrl =
    thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || null;
  const subscribedAt = item.snippet?.publishedAt || null;

  return {
    channel_id: channelId,
    subscription_id: subscriptionId,
    title,
    description,
    thumbnail_url: thumbnailUrl,
    subscribed_at: subscribedAt,
    video_count: null,
    subscriber_count: null,
    category: null,
    tags: "[]",
    last_synced_at: syncTimestamp,
  };
}

export interface FetchSubscriptionsResult {
  items: ChannelRecord[];
  errors: Array<{ reason: string; message: string }>;
}

export async function fetchAllSubscriptions(
  youtubeClient: any,
  syncTimestamp: string = new Date().toISOString()
): Promise<FetchSubscriptionsResult> {
  const items: ChannelRecord[] = [];
  let pageToken: string | undefined = undefined;

  do {
    try {
      const res = await youtubeClient.subscriptions.list({
        mine: true,
        part: ["snippet", "contentDetails"],
        maxResults: 50,
        pageToken,
      });

      const responseData = res?.data || res;
      const rawItems = responseData.items || [];

      for (const item of rawItems) {
        const record = mapSubscriptionToChannelRecord(item, syncTimestamp);
        if (record) {
          items.push(record);
        }
      }

      pageToken = responseData.nextPageToken;
    } catch (err: any) {
      if (isQuotaExceededError(err)) {
        throw new QuotaExceededError(err?.message || "YouTube API quota exceeded.", items);
      }
      throw err;
    }
  } while (pageToken);

  return {
    items,
    errors: [],
  };
}

export function createYouTubeClient(auth: any) {
  return google.youtube({ version: "v3", auth });
}
