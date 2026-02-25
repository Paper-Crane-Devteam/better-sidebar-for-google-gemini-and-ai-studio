export const CURRENT_VERSION = '2.1.0';

export interface ChangeLogItem {
  version: string;
  date: string;
  features: string[];
  fixes?: string[];
}
