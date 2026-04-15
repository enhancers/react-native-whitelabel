import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  rnwlFeatureFlagsManager,
  type RNWLColors,
  type RNWLFeatures,
  type RNWLInitializeOptions,
  type RNWLParamValue,
  type RNWLParams,
} from "../config/rnwlFeatureFlagsManager";

export interface RNWLContextValue {
  isFeatureEnabled: (featureName: string) => boolean;
  getParam: (key: string) => RNWLParamValue | undefined;
  allFeatures: RNWLFeatures;
  enabledFeatures: string[];
  disabledFeatures: string[];
  isLoading: boolean;
  error: Error | null;
  /** Brand identifier (e.g. "blue", "red"). Null if not configured. */
  brand: string | null;
  /** Human-readable app name for this brand. Null if not configured. */
  displayName: string | null;
  /** Native package / bundle identifier. Null if not configured. */
  packageName: string | null;
  /** Custom URL scheme for deep links (e.g. "myapp" → "myapp://"). Null if not configured. */
  deeplinkScheme: string | null;
  /** Domain for universal links / App Links (e.g. "app.example.com"). Null if not configured. */
  universalLinkDomain: string | null;
  /** Brand color tokens (primary, secondary, background, …). Empty object if not configured. */
  colors: RNWLColors;
  /** Custom brand parameters defined under `params:` in config.yml. Empty object if not configured. */
  params: RNWLParams;
}

type State = Omit<RNWLContextValue, "isFeatureEnabled" | "getParam">;

type Action =
  | { type: "LOADED"; payload: Omit<State, "isLoading" | "error"> }
  | { type: "ERROR"; payload: Error };

const initialState: State = {
  allFeatures: {},
  enabledFeatures: [],
  disabledFeatures: [],
  isLoading: true,
  error: null,
  brand: null,
  displayName: null,
  packageName: null,
  deeplinkScheme: null,
  universalLinkDomain: null,
  colors: {},
  params: {},
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "LOADED":
      return { ...action.payload, isLoading: false, error: null };
    case "ERROR":
      return { ...state, isLoading: false, error: action.payload };
  }
}

const RNWLContext = createContext<RNWLContextValue | null>(null);

export interface RNWLProviderProps {
  children: ReactNode;
  options?: RNWLInitializeOptions;
}

export function RNWLProvider({ children, options }: RNWLProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const loadFeatures = async () => {
      try {
        await rnwlFeatureFlagsManager.initialize(options);
        const cfg = rnwlFeatureFlagsManager.getConfig();
        dispatch({
          type: "LOADED",
          payload: {
            allFeatures: rnwlFeatureFlagsManager.getAllFeatures(),
            enabledFeatures: rnwlFeatureFlagsManager.getEnabledFeatures(),
            disabledFeatures: rnwlFeatureFlagsManager.getDisabledFeatures(),
            brand: cfg.brand ?? null,
            displayName: cfg.displayName ?? null,
            packageName: cfg.packageName ?? null,
            deeplinkScheme: cfg.deeplinkScheme ?? null,
            universalLinkDomain: cfg.universalLinkDomain ?? null,
            colors: rnwlFeatureFlagsManager.getColors(),
            params: rnwlFeatureFlagsManager.getParams(),
          },
        });
      } catch (err) {
        dispatch({ type: "ERROR", payload: err instanceof Error ? err : new Error("Unknown error") });
      }
    };

    loadFeatures();
  }, []);

  const isFeatureEnabled = useCallback(
    (featureName: string) => rnwlFeatureFlagsManager.isFeatureEnabled(featureName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.allFeatures]
  );

  const getParam = useCallback(
    (key: string) => rnwlFeatureFlagsManager.getParam(key),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.params]
  );

  const value = useMemo<RNWLContextValue>(
    () => ({ ...state, isFeatureEnabled, getParam }),
    [state, isFeatureEnabled, getParam]
  );

  return (
    <RNWLContext.Provider value={value}>
      {children}
    </RNWLContext.Provider>
  );
}

export function useRNWLContext(): RNWLContextValue {
  const context = useContext(RNWLContext);
  if (!context) {
    throw new Error("useRNWLContext must be used within a <RNWLProvider>");
  }
  return context;
}
