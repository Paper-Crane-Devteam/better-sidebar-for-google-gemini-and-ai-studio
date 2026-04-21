export const CURRENT_VERSION = '2.4.1';

export interface ChangeLogItem {
  version: string;
  date: string;
  features: string[];
  fixes?: string[];
}
