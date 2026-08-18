import type { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Tenant the user belongs to. SUPER_ADMIN (back-office) has null. */
  merchantId: string | null;
  /** Specific branch for cashiers; null for back-office and merchant-wide roles. */
  branchId: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  merchantId: string | null;
  branchId: string | null;
  language: string;
}

export interface LoginResponse {
  /** Short-lived (5 min) access JWT sent in `Authorization: Bearer ...`. */
  token: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: AuthUser;
}

export interface PendingAuthResponse {
  step: 'email-verification' | 'two-factor';
  pendingToken: string;
  email: string;
  phone: string | null;
  /** The account/pending state was created, but the initial OTP delivery failed. */
  deliveryFailed?: boolean;
}

/** Internal — what AuthService produces. The raw refresh token is dropped
 *  in a HttpOnly cookie by the controller layer and never returned in JSON. */
export interface IssuedSession extends LoginResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
}
