declare module "accounts/App" {
  import type { ComponentType } from "react";

  export type AccountsRemoteProps = {
    mode?: "create" | "view";
    mobileNumber?: string;
    roles?: readonly string[];
    authReady?: boolean;
    getAccessToken?: () => string | undefined;
    refreshSession?: () => Promise<unknown>;
    onCreated?: (mobileNumber: string) => void;
    onDeleted?: () => void;
    onUpdated?: () => void;
  };

  const App: ComponentType<AccountsRemoteProps>;
  export default App;
}

declare module "cards/App" {
  import type { ComponentType } from "react";

  const App: ComponentType;
  export default App;
}

declare module "loans/App" {
  import type { ComponentType } from "react";

  const App: ComponentType;
  export default App;
}
