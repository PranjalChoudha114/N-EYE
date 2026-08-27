export type ErrorCategory =
  | 'OBSERVATION_ERROR'
  | 'PERCEPTION_ERROR'
  | 'PRIVACY_ERROR'
  | 'PROTOCOL_ERROR'
  | 'NETWORK_ERROR'
  | 'PLANNER_ERROR'
  | 'VALIDATION_ERROR'
  | 'POLICY_ERROR'
  | 'EXECUTION_ERROR'
  | 'VERIFICATION_ERROR'
  | 'LIFECYCLE_ERROR'
  | 'INTERNAL_ERROR';

export class NEyeError extends Error {
  public readonly category: ErrorCategory;
  public readonly isRecoverable: boolean;
  public readonly timestamp: number;

  constructor(category: ErrorCategory, message: string, isRecoverable = false) {
    super(`[${category}] ${message}`);
    this.name = 'NEyeError';
    this.category = category;
    this.isRecoverable = isRecoverable;
    this.timestamp = Date.now();
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      category: this.category,
      message: this.message,
      isRecoverable: this.isRecoverable,
      timestamp: this.timestamp,
    };
  }
}
