/**
 * RNWL (React Native White Label) Feature Flags Manager
 *
 * Utility for managing white label features across the application
 */

import { NativeModules, Platform } from "react-native";

// Features configuration type
export interface RNWLFeatures {
  [key: string]: boolean;
}

// Custom brand parameters (defined under `params:` in config.yml)
export type RNWLParamValue = string | number | boolean | (string | number | boolean)[];
export interface RNWLParams {
  [key: string]: RNWLParamValue;
}

// Color tokens exposed at runtime
export interface RNWLColors {
  primary?: string;
  secondary?: string;
  background?: string;
  [key: string]: string | undefined;
}

// String config values (brand-level settings, not feature flags)
export interface RNWLConfig {
  /** Human-readable app name for this brand (e.g. "Blue App") */
  displayName?: string;
  /** Native package / bundle identifier (e.g. "com.myapp.blue") */
  packageName?: string;
  /** Custom URL scheme for deep links (e.g. "myapp" → "myapp://") */
  deeplinkScheme?: string;
  /** Domain for universal links / App Links (e.g. "app.example.com") */
  universalLinkDomain?: string;
}

// Manager configuration type
export interface RNWLManagerConfig {
  features?: RNWLFeatures;
}

// Options accepted by initialize()
export interface RNWLInitializeOptions {
  /**
   * Custom async loader that replaces the built-in file/web loading.
   * Useful for fetching feature flags from a remote backend.
   *
   * @example
   * await rnwlFeatureFlagsManager.initialize({
   *   featureLoader: async () => {
   *     const res = await fetch('https://api.example.com/features');
   *     const data = await res.json();
   *     return data.features;
   *   },
   * });
   */
  featureLoader?: () => Promise<RNWLFeatures>;

  /**
   * Static overrides merged on top of whatever was loaded (file or featureLoader).
   * Keys present here always win.
   *
   * @example
   * await rnwlFeatureFlagsManager.initialize({
   *   overrides: { darkMode: true, ads: false },
   * });
   */
  overrides?: RNWLFeatures;
}

// Class to manage feature flags
export class RNWLFeatureFlagsManager {
  private features: RNWLFeatures = {};
  private config: RNWLConfig = {};
  private colors: RNWLColors = {};
  private params: RNWLParams = {};
  private isLoaded = false;

  /**
   * Initialize features from the configuration file, or from a custom loader /
   * static overrides provided via options.
   *
   * Idempotent: if already initialized, subsequent calls without options are
   * no-ops so that useRNWLFeatures() does not overwrite a previous custom init.
   * Pass options to force a re-initialization with new settings, or call
   * reinitialize() explicitly.
   */
  async initialize(options?: RNWLInitializeOptions): Promise<void> {
    if (this.isLoaded && !options) {
      return;
    }

    try {
      if (options?.featureLoader) {
        // Caller supplied their own async loader (e.g. remote backend)
        this.features = await options.featureLoader();
      } else if (Platform.OS === "web") {
        await this.loadFromWeb();
      } else {
        // require() is resolved by Metro synchronously at bundle time, so no
        // await is needed here. When initialize() is called at module level
        // (see bottom of file), isLoaded is set to true before the first
        // component render, eliminating the async race condition.
        try {
          // 'rnwl-config' is a virtual module mapped in the consumer's
          // metro.config.js to their generated rnwl.json at the project root.
          // See: https://github.com/gianlucalippolis/react-native-whitelabel#metro-setup
          const featuresConfig = require("rnwl-config");
          this.features = featuresConfig.features || {};
          this.config = this.extractConfig(featuresConfig);
          this.colors = this.extractColors(featuresConfig);
          this.params = this.extractParams(featuresConfig);
        } catch {
          // rnwl.json not bundled — try NativeModules or fall back to defaults
          if (NativeModules.WhiteLabelConfig) {
            this.features = (await NativeModules.WhiteLabelConfig.getFeatures()) || {};
          } else {
            this.setDefaultFeatures();
          }
        }
      }

      // Merge static overrides last so they always win
      if (options?.overrides) {
        this.features = { ...this.features, ...options.overrides };
      }

      this.isLoaded = true;
    } catch (error) {
      console.warn("Failed to load features, using defaults:", error);
      this.setDefaultFeatures();
      if (options?.overrides) {
        this.features = { ...this.features, ...options.overrides };
      }
      this.isLoaded = true;
    }
  }

  /**
   * Force re-initialization with new options, discarding previous state.
   * Useful when backend flags need to be refreshed at runtime.
   */
  async reinitialize(options?: RNWLInitializeOptions): Promise<void> {
    this.isLoaded = false;
    this.features = {};
    this.colors = {};
    this.params = {};
    await this.initialize(options);
  }

  /**
   * Load features from web (public folder or similar)
   */
  private async loadFromWeb(): Promise<void> {
    try {
      const response = await fetch("/config/rnwl.json");
      if (!response.ok) throw new Error("Failed to fetch features");
      const data = await response.json();
      this.features = data.features || {};
      this.config = this.extractConfig(data);
      this.colors = this.extractColors(data);
      this.params = this.extractParams(data);
    } catch (error) {
      console.warn("Could not load features from web:", error);
      this.setDefaultFeatures();
    }
  }

  private extractConfig(data: Record<string, unknown>): RNWLConfig {
    return {
      displayName: typeof data.displayName === "string" ? data.displayName : undefined,
      packageName: typeof data.packageName === "string" ? data.packageName : undefined,
      deeplinkScheme: typeof data.deeplinkScheme === "string" ? data.deeplinkScheme : undefined,
      universalLinkDomain: typeof data.universalLinkDomain === "string" ? data.universalLinkDomain : undefined,
    };
  }

  private extractColors(data: Record<string, unknown>): RNWLColors {
    if (data.colors && typeof data.colors === "object" && !Array.isArray(data.colors)) {
      return data.colors as RNWLColors;
    }
    return {};
  }

  private extractParams(data: Record<string, unknown>): RNWLParams {
    if (data.params && typeof data.params === "object" && !Array.isArray(data.params)) {
      return data.params as RNWLParams;
    }
    return {};
  }

  /**
   * Set default features if none are loaded
   */
  private setDefaultFeatures(): void {
    this.features = {
      authentication: true,
      pushNotifications: true,
      analytics: true,
      darkMode: false,
      socialSharing: true,
      offlineMode: false,
      appUpdates: true,
      imageGallery: true,
      videoStreaming: false,
      paymentGateway: false,
      demoMode: false,
    };
  }

  /**
   * Get brand-level string config values (deeplinkScheme, universalLinkDomain, …)
   */
  getConfig(): RNWLConfig {
    return { ...this.config };
  }

  getColors(): RNWLColors {
    return { ...this.colors };
  }

  getParams(): RNWLParams {
    return { ...this.params };
  }

  getParam(key: string): RNWLParamValue | undefined {
    return this.params[key];
  }

  /**
   * Check if a feature is enabled.
   * Logs a console error if the feature key does not exist in the loaded config.
   */
  isFeatureEnabled(featureName: string): boolean {
    if (!this.isLoaded) {
      console.warn('[RNWL] Features not yet loaded. Call initialize() first.');
      return false;
    }
    if (!(featureName in this.features)) {
      console.warn(`[RNWL] Feature "${featureName}" does not exist in the loaded configuration.`);
      return false;
    }
    return this.features[featureName] ?? false;
  }

  /**
   * Get all features
   */
  getAllFeatures(): RNWLFeatures {
    return { ...this.features };
  }

  /**
   * Get enabled features only
   */
  getEnabledFeatures(): string[] {
    return Object.entries(this.features)
      .filter(([, isEnabled]) => isEnabled)
      .map(([name]) => name);
  }

  /**
   * Get disabled features only
   */
  getDisabledFeatures(): string[] {
    return Object.entries(this.features)
      .filter(([, isEnabled]) => !isEnabled)
      .map(([name]) => name);
  }

  /**
   * Update a feature flag (useful for testing or dynamic feature toggling)
   */
  setFeature(featureName: string, enabled: boolean): void {
    this.features[featureName] = enabled;
  }

  /**
   * Reset to default features
   */
  reset(): void {
    this.setDefaultFeatures();
  }
}

// Export singleton instance
export const rnwlFeatureFlagsManager = new RNWLFeatureFlagsManager();

// Eagerly initialize on native using the synchronous require() path so that
// isLoaded is true before the first component render, preventing the "Features
// not yet loaded" warning triggered by the useEffect timing gap in RNWLProvider.
// On web this is a no-op (loadFromWeb is async); RNWLProvider's useEffect handles it.
rnwlFeatureFlagsManager.initialize();

export default rnwlFeatureFlagsManager;
