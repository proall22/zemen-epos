export interface EirmsEnvelope<T> {
  data: T;
  status: 'SUCCESS' | string;
}

export interface EirmsTokenResponse {
  accessToken: string;
  refreshToken: string;
  encryptionKey: string | null;
  expiresIn: number;
}

export interface SystemIdentity {
  tin: string;
  systemType: 'POS';
  systemNumber: string;
  clientId: string;
}
