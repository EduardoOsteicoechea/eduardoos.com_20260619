/**
 * Public articles client — cloud pamphlets as linear reading copy.
 * No JWT required; optional Bearer scopes the list to that user.
 */

import { ARTICLE_ROUTES } from "../config/routes";
import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { createCorrelationId } from "./correlation";
import type { EpamRecord } from "./epams";

export interface ArticleBlock {
  type: "heading_1" | "paragraph" | "image" | "meta";
  content: string;
  style_indexes?: number[][];
}

export interface ArticleResponse {
  meta: EpamRecord;
  blocks: ArticleBlock[];
  contentHash: string;
  title: string;
  plainText?: string;
}

export interface ArticlesListResponse {
  count: number;
  articles: EpamRecord[];
  owner?: string;
  public?: boolean;
}

async function requestArticles<T>(path: string): Promise<T> {
  const correlationId = createCorrelationId();
  const token = getAuthToken().trim();
  const result = await apiRequest<T>(path, {
    correlationId,
    authToken: token || undefined,
  });
  if (result.error) throw new Error(formatApiError(result.error));
  if (result.data === undefined || result.data === null) throw new Error("Empty response");
  return result.data;
}

export function fetchArticles(): Promise<ArticlesListResponse> {
  return requestArticles<ArticlesListResponse>(ARTICLE_ROUTES.list);
}

export function fetchArticle(epamId: string): Promise<ArticleResponse> {
  return requestArticles<ArticleResponse>(ARTICLE_ROUTES.item(epamId));
}
