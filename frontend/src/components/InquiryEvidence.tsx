import type { InquiryEvidence as EvidenceFile } from "../lib/admin";

export default function InquiryEvidence({ files }: { files?: EvidenceFile[] }) {
  return <section className="inquiry-evidence">
    <h3>Pictures and documents</h3>
    {!files?.length ? <p>No pictures or documents attached.</p> : <div className="inquiry-evidence-list">
      {files.map((file) => file.mime_type.startsWith("image/")
        ? <a className="inquiry-evidence-image" key={file.id} href={file.data_url} target="_blank" rel="noreferrer" aria-label={`Open image ${file.file_name}`}>
          {/* The image is stored as an inquiry attachment and rendered in its detail view. */}
          <img src={file.data_url} alt={file.file_name}/><span>{file.file_name}</span>
        </a>
        : <a className="inquiry-evidence-document" key={file.id} href={file.data_url} download={file.file_name} target="_blank" rel="noreferrer">{file.file_name}<small>{file.mime_type === "application/pdf" ? "PDF document" : "Download document"}</small></a>)}
    </div>}
  </section>;
}
