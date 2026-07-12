import type { ProjectId, TransactionId } from "@software-builder/core";

export interface DatabaseTransaction {
  readonly transactionId: TransactionId;
  readonly projectId: ProjectId;
}

export interface DatabasePort {
  withProjectTransaction<T>(
    projectId: ProjectId,
    operation: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T>;
  checkHealth(): Promise<boolean>;
  close(): Promise<void>;
}
