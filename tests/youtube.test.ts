import { describe, test, expect } from "bun:test";
import { fetchAllSubscriptions, QuotaExceededError } from "../src/lib/youtube";

describe("YouTube Adapter Seam", () => {
  test("paginates youtube.subscriptions.list through all pages", async () => {
    const mockPages: Record<string, any> = {
      initial: {
        data: {
          nextPageToken: "token_page_2",
          items: [
            {
              id: "sub_1",
              snippet: {
                resourceId: { channelId: "UC1" },
                title: "Channel One",
                description: "Desc 1",
                thumbnails: { default: { url: "http://thumb1.jpg" } },
                publishedAt: "2023-01-01T00:00:00Z",
              },
            },
          ],
        },
      },
      token_page_2: {
        data: {
          nextPageToken: undefined,
          items: [
            {
              id: "sub_2",
              snippet: {
                resourceId: { channelId: "UC2" },
                title: "Channel Two",
                description: "Desc 2",
                thumbnails: { high: { url: "http://thumb2.jpg" } },
                publishedAt: "2023-02-01T00:00:00Z",
              },
            },
          ],
        },
      },
    };

    const mockYoutube = {
      subscriptions: {
        list: async (params: any) => {
          expect(params.mine).toBe(true);
          expect(params.maxResults).toBe(50);
          expect(params.part).toEqual(["snippet", "contentDetails"]);

          const pageToken = params.pageToken || "initial";
          return mockPages[pageToken];
        },
      },
    };

    const result = await fetchAllSubscriptions(mockYoutube as any);
    expect(result.items.length).toBe(2);
    expect(result.items[0].channel_id).toBe("UC1");
    expect(result.items[0].subscription_id).toBe("sub_1");
    expect(result.items[1].channel_id).toBe("UC2");
    expect(result.items[1].subscription_id).toBe("sub_2");
    expect(result.errors.length).toBe(0);
  });

  test("catches quotaExceeded error mid-pagination and throws or surfaces typed QuotaExceededError", async () => {
    const mockYoutube = {
      subscriptions: {
        list: async (params: any) => {
          if (params.pageToken === "token_page_2") {
            const err: any = new Error("The request cannot be completed because you have exceeded your quota.");
            err.code = 403;
            err.errors = [{ reason: "quotaExceeded", message: "Quota exceeded" }];
            throw err;
          }
          return {
            data: {
              nextPageToken: "token_page_2",
              items: [
                {
                  id: "sub_1",
                  snippet: {
                    resourceId: { channelId: "UC1" },
                    title: "Channel One",
                    publishedAt: "2023-01-01T00:00:00Z",
                  },
                },
              ],
            },
          };
        },
      },
    };

    try {
      await fetchAllSubscriptions(mockYoutube as any);
      expect().fail("Should have thrown QuotaExceededError");
    } catch (err: any) {
      expect(err).toBeInstanceOf(QuotaExceededError);
      expect(err.partialItems?.length).toBe(1);
      expect(err.partialItems[0].channel_id).toBe("UC1");
    }
  });
});
