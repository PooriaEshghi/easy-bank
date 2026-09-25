import { lazy } from "react";
import { RemotePanel } from "./RemotePanel";

const AccountsRemote = lazy(() => import("accounts/App"));
const CardsRemote = lazy(() => import("cards/App"));
const LoansRemote = lazy(() => import("loans/App"));

export default function App() {
  return (
    <>
      <header>
        <h1>Easy Bank</h1>
      </header>
      <main className="grid">
        <RemotePanel title="accounts">
          <AccountsRemote />
        </RemotePanel>
        <RemotePanel title="cards">
          <CardsRemote />
        </RemotePanel>
        <RemotePanel title="loans">
          <LoansRemote />
        </RemotePanel>
      </main>
    </>
  );
}
