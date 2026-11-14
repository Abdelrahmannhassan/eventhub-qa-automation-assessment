import { AuthSuccessSchema, MeSuccessSchema } from '@api/contracts/auth.contract';
import type { AuthSuccess, Credentials, MeSuccess } from '@api/contracts/auth.contract';

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
}
