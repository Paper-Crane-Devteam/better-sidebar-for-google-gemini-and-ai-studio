export const CURRENT_VERSION = '2.7.0';

export interface ChangeLogItem {
  version: string;
  date: string;
  features: string[];
  fixes?: string[];
  announcement?: {
    title: string;
    content: string[];
  };
}
