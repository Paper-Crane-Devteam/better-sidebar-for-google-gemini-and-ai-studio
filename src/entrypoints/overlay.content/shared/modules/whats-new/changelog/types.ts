export const CURRENT_VERSION = '2.3.0';

export interface ChangeLogItem {
  version: string;
  date: string;
  features: string[];
  fixes?: string[];
}
