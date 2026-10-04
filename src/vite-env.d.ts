/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** RevenueCat public iOS SDK key: appl_… from CI (RC_IOS_KEY), or a test_… Test Store
   *  key in development bundles only (.env.development). See DEPLOYMENT.md. */
  readonly VITE_RC_IOS_KEY?: string;
}
