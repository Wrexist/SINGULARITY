/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** RevenueCat public iOS SDK key, injected by CI (see DEPLOYMENT.md). */
  readonly VITE_RC_IOS_KEY?: string;
}
