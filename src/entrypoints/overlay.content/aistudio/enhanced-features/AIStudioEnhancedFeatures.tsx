import { AutoHideInputFeature } from './AutoHideInputFeature';
import { AutoHideRunSettingsFeature } from './AutoHideRunSettingsFeature';

/**
 * Container for all AI Studio enhanced features.
 * These features inject CSS/behavior into the native AI Studio page
 * and remain active regardless of whether the overlay sidebar is visible.
 */
export const AIStudioEnhancedFeatures = () => {
  return (
    <>
      <AutoHideInputFeature />
      <AutoHideRunSettingsFeature />
    </>
  );
};
