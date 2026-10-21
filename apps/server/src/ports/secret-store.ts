import type { KeySource, KeyStatus } from '@ccb/contracts';

export type ResolvedKeySource = Exclude<KeySource, 'none'>;

export interface ResolvedSecret {
  key: string;
  source: ResolvedKeySource;
}

export interface SecretWriteResult {
  source: ResolvedKeySource;
  warning?: string;
}

export interface SecretRemoveResult {
  removed: boolean;
  environmentStillSet: boolean;
  warning?: string;
}

export interface SecretStore {
  resolve(): Promise<ResolvedSecret | null>;
  describe(): Promise<KeyStatus>;
  setKey(key: string): Promise<SecretWriteResult>;
  removeKey(): Promise<SecretRemoveResult>;
}
