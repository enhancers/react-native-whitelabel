/**
 * Custom Hook: useRNWLFeatures
 *
 * React hook to access RNWL feature flags in your components.
 * Requires <RNWLProvider> to be mounted higher in the tree.
 *
 * Usage:
 *   const { isFeatureEnabled, allFeatures } = useRNWLFeatures();
 *
 *   if (isFeatureEnabled('pushNotifications')) {
 *     // render push notification related UI
 *   }
 */

import { useRNWLContext, type RNWLContextValue } from "../context/RNWLContext";

export type UseRNWLFeaturesReturn = RNWLContextValue;

export function useRNWLFeatures(): UseRNWLFeaturesReturn {
  return useRNWLContext();
}

export default useRNWLFeatures;
