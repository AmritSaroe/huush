import { handleArticleFetch } from "../_lib/article-proxy";

type PagesContext = { request: Request };

export async function onRequest(context: PagesContext) {
  return handleArticleFetch(context.request);
}
