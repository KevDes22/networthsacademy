import { Landmark } from "lucide-react";
import type { AcademyCertificateRecord } from "@/lib/academy-certification";
import "./academy-certificate-template.css";

function textLength(value: string) {
  return value.length > 78 ? "extended" : value.length > 32 ? "long" : undefined;
}

const issueDate = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

export function CertificateTemplate({ certificate }: { certificate: AcademyCertificateRecord }) {
  return (
    <div className="academy-certificate-frame">
      <article className="academy-certificate" aria-labelledby="academy-certificate-title">
        <div className="academy-certificate-corners" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="academy-certificate-content">
          <p className="academy-certificate-wordmark" aria-label="Networths Academy">
            Networths
          </p>
          <h2 id="academy-certificate-title" className="academy-certificate-title">
            Certificate of Completion
          </h2>
          <p className="academy-certificate-label">Awarded to</p>
          <p
            className="academy-certificate-learner"
            data-long-text={textLength(certificate.learnerName)}
          >
            {certificate.learnerName}
          </p>
          <p className="academy-certificate-label">for completing</p>
          <p
            className="academy-certificate-course"
            data-long-text={textLength(certificate.courseTitle)}
          >
            {certificate.courseTitle}
          </p>
          <div className="academy-certificate-signatories">
            <Signatory name="Destiny Kevin" role="Program Director" />
            <div className="academy-certificate-seal" aria-hidden="true">
              <Landmark />
            </div>
            <Signatory name={certificate.leadInstructorName} role="Lead Instructor" />
          </div>
          <div className="academy-certificate-details">
            <p>Issue date: {issueDate.format(new Date(certificate.issuedAt))}</p>
            <p>Certificate ID: {certificate.id}</p>
          </div>
        </div>
      </article>
    </div>
  );
}

function Signatory({ name, role }: { name: string | null | undefined; role: string }) {
  return (
    <div className="academy-certificate-signatory">
      <p data-long-text={name ? textLength(name) : undefined}>{name || "—"}</p>
      <p>{role}</p>
    </div>
  );
}
