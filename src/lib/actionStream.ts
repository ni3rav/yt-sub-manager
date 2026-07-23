/**
 * Client-side consumer for the NDJSON progress streams emitted by
 * `/api/channels/unsubscribe` and `/api/actions/:id/redo`.
 */

export interface StreamProgress {
  processed: number;
  total: number;
}

export interface StreamSummary {
  succeeded: string[];
  failed: { channelId: string; reason: string }[];
  quotaStopped: boolean;
  skipped: string[];
}

export async function readActionStream(
  res: Response,
  onProgress: (progress: StreamProgress) => void
): Promise<StreamSummary> {
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let summary: StreamSummary | null = null;
  let streamError: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "progress") {
        onProgress({ processed: event.processed, total: event.total });
      } else if (event.type === "done") {
        summary = {
          succeeded: event.succeeded ?? [],
          failed: event.failed ?? [],
          quotaStopped: Boolean(event.quotaStopped),
          skipped: event.skipped ?? [],
        };
      } else if (event.type === "error") {
        streamError = event.message;
      }
    }

    if (done) break;
  }

  if (!summary) {
    throw new Error(streamError || "The operation was interrupted before completing.");
  }
  return summary;
}
