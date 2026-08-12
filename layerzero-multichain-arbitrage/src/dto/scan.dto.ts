export interface ScanSummaryDto {
  assets: number;
  deployments: number;
  verified: number;
  rejected: number;
  failed: number;
  unchanged: number;
  skipped: number;
}

export interface ScanTriggerResponseDto {
  status: 'started' | 'already_running';
}

export interface ScanStatusResponseDto {
  state: 'idle' | 'running' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  summary: ScanSummaryDto | null;
  error: string | null;
}
