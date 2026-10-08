import { ContactInfoPanel } from "./ContactInfoPanel";

export function ContactsPage() {
  return (
    <div className="grid">
      <ContactInfoPanel title="Contatti accounts" path="/eazybank/accounts/api/contact-info" />
      <ContactInfoPanel title="Contatti cards" path="/eazybank/cards/api/contact-info" />
      <ContactInfoPanel title="Contatti loans" path="/eazybank/loans/api/contact-info" />
    </div>
  );
}
