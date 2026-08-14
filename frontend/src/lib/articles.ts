import { apiRequest, formatApiError } from "./api";
import { getAuthToken } from "./auth";
import { ARTICLE_ROUTES } from "../config/routes";
import { createCorrelationId } from "./telemetry";
import type { EpamRecord } from "./epams";

export interface ArticleBlock {
    type: "heading_1" | "paragraph" | "image" | "meta";
    content: string;
    /** Pamphlet bold range lives in style_indexes[0] as [start, end) char offsets. */
    style_indexes?: number[][];
}

export interface ArticleResponse {
    meta: EpamRecord;
    blocks: ArticleBlock[];
    contentHash: string;
    title: string;
}

export interface QuizQuestion {
    id: string;
    prompt: string;
    choices: string[];
    answerIndex: number;
    explanation: string;
}

export interface QuizDocument {
    epamId: string;
    contentHash: string;
    generatedAt: string;
    questions: QuizQuestion[];
}

export interface ArticlesListResponse {
    count: number;
    articles: EpamRecord[];
}

async function authed<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const correlationId = createCorrelationId();
    const token = getAuthToken();
    if (!token) throw new Error("Inicia sesión para ver artículos.");
    const result = await apiRequest<T>(path, {
        method: init?.method,
        body: init?.body,
        correlationId,
        authToken: token,
    });
    if (result.error) throw new Error(formatApiError(result.error));
    if (result.data === undefined || result.data === null) throw new Error("Empty response");
    return result.data;
}

export function fetchArticles(): Promise<ArticlesListResponse> {
    return authed<ArticlesListResponse>(ARTICLE_ROUTES.list);
}

export function fetchArticle(epamId: string): Promise<ArticleResponse> {
    return authed<ArticleResponse>(ARTICLE_ROUTES.item(epamId));
}

export function fetchArticleQuiz(epamId: string): Promise<{ quiz: QuizDocument; generated: boolean }> {
    return authed(ARTICLE_ROUTES.quiz(epamId));
}

export function askArticle(
    epamId: string,
    question: string,
    history: string[],
): Promise<{ answer: string }> {
    return authed(ARTICLE_ROUTES.ask(epamId), {
        method: "POST",
        body: { question, history },
    });
}
