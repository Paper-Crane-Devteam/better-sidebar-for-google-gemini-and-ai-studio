import { Platform } from '@/shared/types/platform';
import { BackfillRunner } from '../../shared/backfill/runner';

/** AI Studio's idle history backfill. One instance per tab; see `BackfillRunner`. */
export const aiStudioBackfillRunner = new BackfillRunner(Platform.AI_STUDIO);
