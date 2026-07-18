import {
  handleProviderProxyRequest,
  type PagesFunctionContext
} from "../_shared/runtime/proxyHandlers";

export function onRequest(context: PagesFunctionContext) {
  return handleProviderProxyRequest(context, "vidplays-proxy");
}
