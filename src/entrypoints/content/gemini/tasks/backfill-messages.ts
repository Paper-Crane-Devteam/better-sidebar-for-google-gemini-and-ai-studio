import { Platform } from '@/shared/types/platform';
import { BackfillRunner } from '../../shared/backfill/runner';

/** Gemini's idle history backfill. One instance per tab; see `BackfillRunner`. */
export const geminiBackfillRunner = new BackfillRunner(Platform.GEMINI);
