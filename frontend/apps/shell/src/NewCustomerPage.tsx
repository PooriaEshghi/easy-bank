import { lazy } from "react";
import { useNavigate } from "react-router";
import { RemotePanel } from "./RemotePanel";
import { authClient } from "./session";
import { useAuth } from "./useAuth";

const AccountsRemote = lazy(() => import("accounts/App"));

export function NewCustomerPage() {
  const navigate = useNavigate();
  const { ready, session } = useAuth();

  return (
    <RemotePanel title="accounts">
      <AccountsRemote
        mode="create"
        roles={session.roles}
        authReady={ready}
        getAccessToken={() => authClient.getSession().accessToken ?? undefined}
        refreshSession={() => authClient.refresh()}
        onCreated={(mobileNumber) => navigate(`/clienti/${mobileNumber}`)}
      />
    </RemotePanel>
  );
}
