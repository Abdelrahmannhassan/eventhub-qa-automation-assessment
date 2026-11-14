import {
  AuthSuccessSchema,
  ConfigSuccessSchema,
  HealthSuccessSchema,
  MeSuccessSchema,
} from '@api/contracts/auth.contract';
import type {
  AuthSuccess,
  ConfigSuccess,
  Credentials,
  HealthSuccess,
  MeSuccess,
} from '@api/contracts/auth.contract';

import { BaseApiClient } from './base.client';
import type { ApiResult } from './base.client';

export class AuthClient extends BaseApiClient {
  /** `201` on success. Phase 2 confirmed there is no email-verification step. */
  async register(credentials: Credentials): Promise<ApiResult<AuthSuccess>> {
    const response = await this.post('/api/auth/register', credentials);
    return this.toResult(response, 201, AuthSuccessSchema, (parsed) => parsed);
  }

  async login(credentials: Credentials): Promise<ApiResult<AuthSuccess>> {
    const response = await this.post('/api/auth/login', credentials);
    return this.toResult(response, 200, AuthSuccessSchema, (parsed) => parsed);
  }

  /** The only operation whose documentation declares authentication (mismatch M1). */
  async me(): Promise<ApiResult<MeSuccess>> {
    const response = await this.get('/api/auth/me');
    return this.toResult(response, 200, MeSuccessSchema, (parsed) => parsed);
  }

  /** One of only two endpoints that work without a token. */
  async health(): Promise<ApiResult<HealthSuccess>> {
    const response = await this.get('/api/health');
    return this.toResult(response, 200, HealthSuccessSchema, (parsed) => parsed);
  }

  /** The other. Public feature flags. */
  async config(): Promise<ApiResult<ConfigSuccess>> {
    const response = await this.get('/api/config');
    return this.toResult(response, 200, ConfigSuccessSchema, (parsed) => parsed);
  }
}
