import { useRNWLContext } from "../context/RNWLContext";
import type { RNWLColors } from "../config/rnwlFeatureFlagsManager";

export type { RNWLColors };

export function useRNWLColors(): RNWLColors {
  const { colors } = useRNWLContext();
  return colors;
}

export default useRNWLColors;
