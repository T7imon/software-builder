export interface DatabasePort {
  checkHealth(): Promise<boolean>;
  close(): Promise<void>;
}
