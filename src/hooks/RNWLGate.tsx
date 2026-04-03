/**
 * RNWL Gate Component
 *
 * Conditional rendering wrapper that shows content only if a feature is enabled.
 * Requires <RNWLProvider> to be mounted higher in the tree.
 *
 * Usage:
 *   <RNWLGate feature="pushNotifications">
 *     <PushNotificationComponent />
 *   </RNWLGate>
 */

import React, { type ReactNode } from "react";
import { useRNWLFeatures } from "./useRNWLFeatures";

export interface RNWLGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export const RNWLGate: React.FC<RNWLGateProps> = ({
  feature,
  children,
  fallback = null,
}) => {
  const { isFeatureEnabled } = useRNWLFeatures();
  return isFeatureEnabled(feature) ? <>{children}</> : <>{fallback}</>;
};

export default RNWLGate;
