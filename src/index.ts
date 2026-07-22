import { createAppServer } from "./server";

const server = createAppServer({
  port: 0,
  hostname: "127.0.0.1",
  autoOpenBrowser: process.env.NODE_ENV !== "test",
});

console.log(`🚀 YouTube Subscription Manager running at ${server.url}`);
