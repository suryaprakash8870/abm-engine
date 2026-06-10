import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';

/**
 * Thin HubSpot HTTP client. Per CLAUDE.md "All external API calls go through
 * a rate-limited, cached wrapper." This is that wrapper for HubSpot.
 *
 *  - Bearer auth (Service Key in Phase 1; per-org OAuth token in prod)
 *  - Token-bucket rate limit (HubSpot Private/Service Keys: 100 req/10s burst,
 *    250k/day. We cap at ~9/s = 90/10s for a safety margin)
 *  - Optional Redis-backed GET cache via `cacheKey` + `cacheTtlSeconds`
 *  - Single retry on 429 honoring Retry-After
 *
 * Phase 1 dev: the token comes from `HUBSPOT_SERVICE_KEY`. For multi-tenant
 * prod the adapter will pass per-request tokens (decrypted from
 * `crm_connections`). The client itself stays stateless on the auth side —
 * pass token in via `requestWithToken()` when needed.
 */
@Injectable()
export class HubspotHttpClient {
  private readonly logger = new Logger(HubspotHttpClient.name);
  private readonly baseUrl = 'https://api.hubapi.com';
  private readonly defaultToken: string | undefined;
  private readonly limiter: TokenBucket;

  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.defaultToken = config.get<string>('HUBSPOT_SERVICE_KEY');
    this.limiter = new TokenBucket({ tokensPerInterval: 9, intervalMs: 1_000, maxTokens: 9 });
  }

  get<T>(path: string, opts?: RequestOpts): Promise<T> {
    return this.request<T>('GET', path, undefined, opts);
  }

  post<T>(path: string, body: unknown, opts?: RequestOpts): Promise<T> {
    return this.request<T>('POST', path, body, opts);
  }

  patch<T>(path: string, body: unknown, opts?: RequestOpts): Promise<T> {
    return this.request<T>('PATCH', path, body, opts);
  }

  put<T>(path: string, body: unknown, opts?: RequestOpts): Promise<T> {
    return this.request<T>('PUT', path, body, opts);
  }

  delete<T>(path: string, opts?: RequestOpts): Promise<T> {
    return this.request<T>('DELETE', path, undefined, opts);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    opts: RequestOpts = {},
  ): Promise<T> {
    const token = opts.token ?? this.defaultToken;
    if (!token) {
      throw new Error(
        'HubSpot call attempted without a token. Set HUBSPOT_SERVICE_KEY in .env or pass opts.token.',
      );
    }

    // Cache lookup (GET only).
    if (method === 'GET' && opts.cacheKey) {
      const cached = await this.safeCacheGet(opts.cacheKey);
      if (cached !== null) return JSON.parse(cached) as T;
    }

    await this.limiter.acquire();
    const res = await this.doFetch(method, path, body, token);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '1');
      this.logger.warn(`HubSpot 429 on ${method} ${path} — retrying in ${retryAfter}s`);
      await sleep(retryAfter * 1_000);
      await this.limiter.acquire();
      const retry = await this.doFetch(method, path, body, token);
      return this.handleResponse<T>(method, path, retry, opts);
    }

    return this.handleResponse<T>(method, path, res, opts);
  }

  private async doFetch(
    method: string,
    path: string,
    body: unknown,
    token: string,
  ): Promise<Response> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    return fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private async handleResponse<T>(
    method: string,
    path: string,
    res: Response,
    opts: RequestOpts,
  ): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw new HubspotHttpError(method, path, res.status, text);
    }
    const json = text ? (JSON.parse(text) as T) : (undefined as T);

    if (method === 'GET' && opts.cacheKey && opts.cacheTtlSeconds && text) {
      await this.safeCacheSet(opts.cacheKey, opts.cacheTtlSeconds, text);
    }
    return json;
  }

  private async safeCacheGet(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`Redis cache get failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  private async safeCacheSet(key: string, ttl: number, value: string): Promise<void> {
    try {
      await this.redis.setex(key, ttl, value);
    } catch (err) {
      this.logger.warn(`Redis cache set failed for ${key}: ${(err as Error).message}`);
    }
  }
}

export interface RequestOpts {
  /** Override the default Service Key — used for per-org OAuth tokens later. */
  token?: string;
  /** Redis cache key for GETs. Omit to bypass caching. */
  cacheKey?: string;
  /** TTL for the cache entry, in seconds. Required if cacheKey is set. */
  cacheTtlSeconds?: number;
}

export class HubspotHttpError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`HubSpot ${method} ${path} → ${status}: ${body.slice(0, 200)}`);
    this.name = 'HubspotHttpError';
  }
}

/**
 * Minimal in-memory token bucket. Good enough for a single-worker dev API.
 * For multi-worker prod we'll swap in a Redis-backed limiter (Bottleneck or
 * a Lua script) so quota is shared across workers — tracked for Phase 4.
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly opts: { tokensPerInterval: number; intervalMs: number; maxTokens: number },
  ) {
    this.tokens = opts.maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const wait = Math.ceil(this.opts.intervalMs / this.opts.tokensPerInterval);
      await sleep(wait);
    }
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    const refilled = (elapsed / this.opts.intervalMs) * this.opts.tokensPerInterval;
    this.tokens = Math.min(this.opts.maxTokens, this.tokens + refilled);
    this.lastRefill = now;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
