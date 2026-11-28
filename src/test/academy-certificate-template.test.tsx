import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CertificateTemplate } from "@/components/academy-certificate-template";

const certificate = {
  id: "00000000-0000-4000-8000-000000000001",
  learnerName: "Amara Okafor",
  courseTitle: "Data Analysis",
  issuedAt: "2026-11-27T23:30:00Z",
};

describe("Certificate template", () => {
  it("prints official record fields and names the director and stored instructor", () => {
    render(<CertificateTemplate certificate={{ ...certificate, leadInstructorName: "Ada Eze" }} />);
    expect(screen.getByRole("article", { name: "Certificate of Completion" })).toBeVisible();
    for (const text of [
      "Amara Okafor",
      "Data Analysis",
      "Destiny Kevin",
      "Ada Eze",
      "Program Director",
      "Lead Instructor",
      "Issue date: 28 November 2026",
      `Certificate ID: ${certificate.id}`,
    ]) {
      expect(screen.getByText(text)).toBeVisible();
    }
  });

  it("supports certificates issued before instructor names were captured", () => {
    render(<CertificateTemplate certificate={certificate} />);
    expect(screen.getByText("Lead Instructor").previousElementSibling).toHaveTextContent("—");
  });
});
