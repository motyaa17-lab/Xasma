import React from "react";

function Section({ title, children }) {
  return (
    <section className="legalSection">
      <h2 className="legalH2">{title}</h2>
      <div className="legalBody">{children}</div>
    </section>
  );
}

function P({ children }) {
  return <p className="legalP">{children}</p>;
}

function Ul({ children }) {
  return <ul className="legalUl">{children}</ul>;
}

function Li({ children }) {
  return <li className="legalLi">{children}</li>;
}

function mailto(email, subject) {
  const e = String(email || "").trim();
  if (!e) return "";
  const s = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return `mailto:${encodeURIComponent(e)}${s}`;
}

export default function LegalPage({ kind, t, lang, onBack }) {
  const supportEmail = "xasma.support@gmail.com";
  const lastUpdated = "2026-05-01";

  const title =
    kind === "privacy"
      ? t("privacyPolicyTitle") ?? "Privacy Policy"
      : kind === "terms"
        ? t("termsTitle") ?? "Terms of Service"
        : kind === "data-safety"
          ? t("dataSafetyTitle") ?? "Data Safety"
        : t("dataDeletionTitle") ?? "Data deletion";

  const backLabel = t("back") ?? "Back";

  return (
    <div className="legalRoot">
      <header className="legalTopBar">
        <button type="button" className="legalBackBtn" onClick={onBack} aria-label={backLabel}>
          <span aria-hidden>←</span>
        </button>
        <div className="legalTitle">{title}</div>
        <div style={{ width: 38 }} aria-hidden />
      </header>

      <div className="legalScroll">
        <div className="legalMeta muted">
          {(t("lastUpdated") ?? "Last updated") + ": " + lastUpdated}
        </div>

        {kind === "privacy" ? (
          <>
            <Section title={t("privacyIntroTitle") ?? "Overview"}>
              <P>
                {t("privacyIntroBody") ??
                  "This policy explains what data the app may process, why, and what choices you have."}
              </P>
            </Section>

            <Section title={t("privacyDataWeProcessTitle") ?? "Data we process"}>
              <Ul>
                <Li>{t("privacyAccount") ?? "Account data: username, email (if provided), avatar and profile settings."}</Li>
                <Li>{t("privacyMessages") ?? "Messages: message content is sent to the server to deliver it to chat participants."}</Li>
                <Li>{t("privacyLocalStorage") ?? "Local storage: UI settings and drafts are stored on your device/browser."}</Li>
                <Li>{t("privacyContacts") ?? "Contacts (optional): if you allow access, contacts may be imported locally to help you find people."}</Li>
              </Ul>
            </Section>

            <Section title={t("privacyPermissionsTitle") ?? "Permissions"}>
              <Ul>
                <Li>{t("privacyPermNotifications") ?? "Notifications: used to show new message alerts (optional)."} </Li>
                <Li>{t("privacyPermContacts") ?? "Contacts: used only if you explicitly allow it (optional)."} </Li>
                <Li>{t("privacyPermMic") ?? "Microphone: used for voice messages/calls when you start recording or a call."}</Li>
              </Ul>
            </Section>

            <Section title={t("privacySharingTitle") ?? "Sharing"}>
              <P>
                {t("privacySharingBody") ??
                  "We share message data only with the chat participants and the service infrastructure required to deliver it."}
              </P>
            </Section>

            <Section title={t("privacyContactTitle") ?? "Contact"}>
              <P>
                {(t("privacyContactBody") ?? "Questions? Contact support at") + " "}
                <a href={mailto(supportEmail, "Privacy policy question")} className="legalLink">
                  {supportEmail}
                </a>
                .
              </P>
            </Section>
          </>
        ) : null}

        {kind === "terms" ? (
          <>
            <Section title={t("termsUseTitle") ?? "Using the service"}>
              <Ul>
                <Li>{t("termsUse1") ?? "Do not abuse the service or attempt to disrupt it."}</Li>
                <Li>{t("termsUse2") ?? "Do not upload illegal content."}</Li>
                <Li>{t("termsUse3") ?? "You are responsible for content you send."}</Li>
              </Ul>
            </Section>

            <Section title={t("termsModerationTitle") ?? "Moderation"}>
              <P>
                {t("termsModerationBody") ??
                  "We may restrict accounts that violate these rules to protect users and the platform."}
              </P>
            </Section>

            <Section title={t("privacyContactTitle") ?? "Contact"}>
              <P>
                {(t("termsContactBody") ?? "Support:") + " "}
                <a href={mailto(supportEmail, "Terms question")} className="legalLink">
                  {supportEmail}
                </a>
                .
              </P>
            </Section>
          </>
        ) : null}

        {kind === "data-deletion" ? (
          <>
            <Section title={t("dataDeletionHowTitle") ?? "How to request deletion"}>
              <P>
                {t("dataDeletionHowBody") ??
                  "To request deletion of your account data, email support from the address used in your account."}
              </P>
              <P>
                <a href={mailto(supportEmail, "Data deletion request")} className="legalLink">
                  {supportEmail}
                </a>
              </P>
            </Section>

            <Section title={t("dataDeletionLocalTitle") ?? "Local data"}>
              <P>
                {t("dataDeletionLocalBody") ??
                  "You can remove local-only data (drafts, settings, cached stories/contacts) by clearing site/app storage on your device."}
              </P>
            </Section>
          </>
        ) : null}

        {kind === "data-safety" ? (
          <>
            <Section title={t("dataSafetyOverviewTitle") ?? "Overview"}>
              <P>
                {t("dataSafetyOverviewBody") ??
                  "This page summarizes data handling to help with Google Play 'Data safety' disclosures."}
              </P>
            </Section>

            <Section title={t("dataSafetyCollectedTitle") ?? "Data collected"}>
              <Ul>
                <Li>{t("dataSafetyCollectedAccount") ?? "Account info (username, email if provided)."} </Li>
                <Li>{t("dataSafetyCollectedMessages") ?? "Messages (content and metadata required for delivery)."} </Li>
                <Li>{t("dataSafetyCollectedMedia") ?? "Media you send (images/voice/video notes)."} </Li>
              </Ul>
            </Section>

            <Section title={t("dataSafetyOptionalTitle") ?? "Optional access"}>
              <Ul>
                <Li>{t("dataSafetyOptionalContacts") ?? "Contacts: only if you explicitly allow it in Contacts tab."}</Li>
                <Li>{t("dataSafetyOptionalNotifications") ?? "Notifications: only if you enable alerts."}</Li>
                <Li>{t("dataSafetyOptionalMic") ?? "Microphone: only when recording voice/video note or during calls."}</Li>
              </Ul>
            </Section>

            <Section title={t("dataSafetyRetentionTitle") ?? "Retention & deletion"}>
              <P>{t("dataSafetyRetentionBody") ?? "You can request account deletion via the Data deletion page."}</P>
              <P>
                <a href="/data-deletion" className="legalLink">
                  {t("dataDeletionTitle") ?? "Data deletion"}
                </a>
              </P>
            </Section>

            <Section title={t("privacyContactTitle") ?? "Contact"}>
              <P>
                {(t("termsContactBody") ?? "Support:") + " "}
                <a href={mailto(supportEmail, "Data safety question")} className="legalLink">
                  {supportEmail}
                </a>
                .
              </P>
            </Section>
          </>
        ) : null}
      </div>
    </div>
  );
}

