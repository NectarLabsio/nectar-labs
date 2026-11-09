"use client";
import { useState } from "react";
import { Banner, Button, Card, Field } from "@nectar/ui";
import { CONTACT_EMAIL } from "@/lib/env";

// Form provider is a human decision (PRD §12 "form → provider (HUMAN)"). Until then the form composes a mailto: message.
export default function TalkPage() {
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false);
  const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Nectar pilot: ${org || name}`)}&body=${encodeURIComponent(`${msg}\n\n${name}${org ? `, ${org}` : ""}`)}`;
  return (
    <div className="page wrap">
      <div className="page-head">
        <span className="label">Talk to us</span>
        <h1>Nectar pilot cohort</h1>
        <p className="lead">Market makers, curators and issuers of tokenized assets: tell us what you would commit or list.</p>
      </div>
      <Card>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); window.location.href = href; setSent(true); }}>
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          <Field label="Organisation" value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="organization" />
          <div className="field">
            <label htmlFor="talk-msg">Message</label>
            <textarea id="talk-msg" className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} required />
          </div>
          <div className="row"><Button type="submit" variant="primary">Open email to send</Button><span className="caption">Opens your mail app addressed to {CONTACT_EMAIL}. Nothing is stored here.</span></div>
          {sent ? <Banner tone="good" title="Draft opened">If no mail app opened, write to <a className="link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</Banner> : null}
        </form>
      </Card>
    </div>
  );
}
