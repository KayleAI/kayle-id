import { useState } from "react";
import { useVerificationStore } from "../../stores/session";

/**
 * Attributes that can be shared with the requesting organization.
 */
type ShareableAttribute = {
  id: string;
  label: string;
  description: string;
  value: string | null;
};

/**
 * Component for selecting which attributes to share with the organization.
 */
export function ShareDetails() {
  const decryptedData = useVerificationStore((state) => state.decryptedData);
  const goToTeardown = useVerificationStore((state) => state.goToTeardown);

  // Build shareable attributes from decrypted data
  const attributes: ShareableAttribute[] = [
    {
      id: "name",
      label: "Full Name",
      description: "Your name as shown on your document",
      value: decryptedData.mrz?.parsed
        ? `${decryptedData.mrz.parsed.givenNames} ${decryptedData.mrz.parsed.surname}`
        : null,
    },
    {
      id: "nationality",
      label: "Nationality",
      description: "Your nationality",
      value: decryptedData.mrz?.parsed.nationality ?? null,
    },
    {
      id: "dob",
      label: "Date of Birth",
      description: "Your date of birth",
      value: decryptedData.mrz?.parsed.dateOfBirth
        ? formatDate(decryptedData.mrz.parsed.dateOfBirth)
        : null,
    },
    {
      id: "document_number",
      label: "Document Number",
      description: "Your passport/ID number",
      value: decryptedData.mrz?.parsed.documentNumber ?? null,
    },
    {
      id: "expiry",
      label: "Document Expiry",
      description: "When your document expires",
      value: decryptedData.mrz?.parsed.expiryDate
        ? formatDate(decryptedData.mrz.parsed.expiryDate)
        : null,
    },
  ];

  const [selectedAttributes, setSelectedAttributes] = useState<Set<string>>(
    new Set(attributes.filter((a) => a.value).map((a) => a.id))
  );

  const toggleAttribute = (id: string) => {
    setSelectedAttributes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleShare = () => {
    // In a real implementation, this would send the selected attributes
    // to the webhook or redirect with the result
    console.log(
      "Sharing attributes:",
      [...selectedAttributes].map((id) => attributes.find((a) => a.id === id))
    );
    goToTeardown();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <h2 className="mb-2 font-semibold text-xl">Choose what to share</h2>
        <p className="mb-6 text-muted-foreground text-sm">
          Only the items you select will be shared with{" "}
          <span className="font-bold text-foreground underline decoration-dashed underline-offset-2">
            Platform Name
          </span>
        </p>

        <div className="space-y-3">
          {attributes
            .filter((attr) => attr.value)
            .map((attr) => (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                key={attr.id}
              >
                <input
                  checked={selectedAttributes.has(attr.id)}
                  className="mt-1 h-4 w-4 rounded border-input"
                  onChange={() => toggleAttribute(attr.id)}
                  type="checkbox"
                />
                <div className="flex-1">
                  <div className="font-medium">{attr.label}</div>
                  <div className="text-muted-foreground text-sm">
                    {attr.value}
                  </div>
                </div>
              </label>
            ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
            disabled={selectedAttributes.size === 0}
            onClick={handleShare}
            type="button"
          >
            Share ({selectedAttributes.size})
          </button>
          <button
            className="rounded-lg border px-4 py-2 transition-colors hover:bg-muted"
            onClick={() => window.history.back()}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Format a date string from YYMMDD to readable format.
 */
function formatDate(yymmdd: string): string {
  if (yymmdd.length !== 6) {
    return yymmdd;
  }

  const yy = Number.parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);

  // Assume 20XX for years 00-30, 19XX for 31-99
  const year = yy <= 30 ? 2000 + yy : 1900 + yy;

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthName = months[Number.parseInt(mm, 10) - 1] ?? mm;

  return `${dd} ${monthName} ${year}`;
}
