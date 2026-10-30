import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: false,
  publicPaths: ["/", "/favicon.svg", "/icon-180.svg", "/r/:id"],
  marketing: false,
});
