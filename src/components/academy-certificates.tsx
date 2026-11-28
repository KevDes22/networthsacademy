import { CertificateTemplate } from "@/components/academy-certificate-template";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { listAcademyCertificates } from "@/lib/academy-certification.functions";

export function AcademyCertificates({ userId }: { userId: string }) {
  const certificateId = useSearch({
    from: "/_authenticated/dashboard/certificates",
    select: (search) => search.certificate,
  });
  const list = useServerFn(listAcademyCertificates);
  const certificates = useQuery({
    queryKey: ["academy-certificates", userId],
    queryFn: () => list(),
    gcTime: 0,
    retry: false,
  });
  const selected = certificates.data?.find((certificate) => certificate.id === certificateId);
  return (
    <section>
      <h1 className="section-title">Certificates</h1>
      {certificates.isPending && (
        <p role="status" className="mt-4">
          Loading certificates…
        </p>
      )}
      {certificates.isError && (
        <div role="alert" className="mt-4">
          <p>{certificates.error.message}</p>
          <Button variant="outline" className="mt-3" onClick={() => void certificates.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {certificates.isSuccess &&
        (certificateId ? (
          <>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/dashboard/certificates" search={{}}>
                Back to certificates
              </Link>
            </Button>
            {selected ? (
              <>
                <CertificateTemplate certificate={selected} />
                <Button className="mt-4" onClick={() => window.print()}>
                  Print or save PDF
                </Button>
              </>
            ) : (
              <p role="status" className="mt-4">
                This certificate is unavailable.
              </p>
            )}
          </>
        ) : certificates.data.length ? (
          <ul className="mt-5 space-y-3">
            {certificates.data.map((certificate) => (
              <li
                key={certificate.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4"
              >
                <span className="font-medium">{certificate.courseTitle}</span>
                <Button asChild variant="outline">
                  <Link to="/dashboard/certificates" search={{ certificate: certificate.id }}>
                    View certificate
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5">
            <p>Certificates appear here after you complete a course and request one.</p>
            <Button asChild className="mt-4">
              <Link to="/dashboard/courses">My Courses</Link>
            </Button>
          </div>
        ))}
    </section>
  );
}
