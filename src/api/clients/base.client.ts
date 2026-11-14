import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { z } from 'zod';

import { logger } from '@core/logger';

/** Thrown when a successful response does not match its contract. Carries the body. */
export class ContractViolationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ContractViolationError';
  }
}

/**
 * Outcome of an HTTP call.
 *
 * `status` and `body` are **always** safe to read, even when the response
 * violated its contract. That matters: a test must be able to register a
 * just-created resource for cleanup before it validates anything, otherwise a
 * contract failure leaks data on a shared environment — which is exactly the bug
 * this class was introduced to fix.
 *
 * Reading `data` is itself the contract assertion: it returns validated data, or
 * throws `ContractViolationError` describing precisely what changed.
 */
export class ApiResult<T> {
  constructor(
    readonly status: number,
    readonly body: unknown,
    private readonly parsed?: T,
    private readonly violation?: ContractViolationError,
  ) {}

  get data(): T | undefined {
    if (this.violation) {
      throw this.violation;
    }

    return this.parsed;
  }
}

/**
 * Shared HTTP behaviour: URL building, logging with redaction, and contract
 * validation. Clients return typed data and **never assert** — assertions belong
 * to tests (CLAUDE.md §2).
 */
export abstract class BaseApiClient {
  protected readonly log = logger.child(this.constructor.name);

  constructor(protected readonly request: APIRequestContext) {}

  protected async get(path: string): Promise<APIResponse> {
    return this.send('GET', path);
  }

  protected async post(path: string, body: unknown): Promise<APIResponse> {
    return this.send('POST', path, body);
  }

  protected async delete(path: string): Promise<APIResponse> {
    return this.send('DELETE', path);
  }

  private async send(method: string, path: string, body?: unknown): Promise<APIResponse> {
    this.log.debug(`${method} ${path}`, body === undefined ? undefined : { body });

    const response = await this.request.fetch(path, {
      method,
      ...(body === undefined ? {} : { data: body }),
    });

    this.log.debug(`${method} ${path} -> ${response.status()}`);

    return response;
  }

  /**
   * Validation runs only on the expected success status: an error body has a
   * different shape by design, and a test asserting a `400` should see the real
   * message rather than a parse failure.
   */
  protected async toResult<S extends z.ZodType, T>(
    response: APIResponse,
    successStatus: number,
    schema: S,
    pick: (parsed: z.infer<S>) => T,
  ): Promise<ApiResult<T>> {
    const status = response.status();
    const body: unknown = await this.readBody(response);

    if (status !== successStatus) {
      return new ApiResult<T>(status, body);
    }

    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return new ApiResult<T>(
        status,
        body,
        undefined,
        new ContractViolationError(
          `Response contract violated for ${response.url()} (HTTP ${status}).\n` +
            `This means the API shape changed — see docs/api-findings.md.\n` +
            parsed.error.issues
              .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
              .join('\n'),
          status,
          body,
        ),
      );
    }

    return new ApiResult<T>(status, body, pick(parsed.data));
  }

  private async readBody(response: APIResponse): Promise<unknown> {
    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
