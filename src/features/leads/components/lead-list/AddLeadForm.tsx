"use client";

type AddLeadFormProps = {
  onCancel: () => void;
  onSubmit: (data: Record<string, string>) => void;
};

export function AddLeadForm({ onCancel, onSubmit }: AddLeadFormProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSubmit({
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      company: String(formData.get("company") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      city: String(formData.get("city") ?? ""),
      state: String(formData.get("state") ?? ""),
      value: String(formData.get("value") ?? ""),
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(15% 0.012 70 / 0.32)",
        backdropFilter: "blur(2px)",
        zIndex: 60,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        style={{
          background: "var(--crm-surface)",
          border: "1px solid var(--crm-border)",
          borderRadius: "var(--crm-radius-lg)",
          padding: 28,
          width: 440,
          boxShadow: "var(--crm-shadow-pop)",
        }}
      >
        <h3
          style={{
            margin: "0 0 18px",
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--crm-fg)",
          }}
        >
          New lead
        </h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              ["firstName", "First name"],
              ["lastName", "Last name"],
            ].map(([name, label]) => (
              <label key={name} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--crm-fg-muted)",
                    fontWeight: 500,
                  }}
                >
                  {label}
                </span>
                <input
                  name={name}
                  style={{
                    height: 34,
                    padding: "0 10px",
                    border: "1px solid var(--crm-border)",
                    borderRadius: "var(--crm-radius-sm)",
                    background: "var(--crm-surface-2)",
                    fontSize: 13,
                    fontFamily: "var(--crm-font-sans)",
                    color: "var(--crm-fg)",
                    outline: "none",
                  }}
                />
              </label>
            ))}
          </div>
          {[
            ["company", "Company"],
            ["email", "Work email"],
            ["phone", "Phone"],
          ].map(([name, label]) => (
            <label key={name} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--crm-fg-muted)",
                  fontWeight: 500,
                }}
              >
                {label}
              </span>
              <input
                name={name}
                type={name === "email" ? "email" : "text"}
                style={{
                  height: 34,
                  padding: "0 10px",
                  border: "1px solid var(--crm-border)",
                  borderRadius: "var(--crm-radius-sm)",
                  background: "var(--crm-surface-2)",
                  fontSize: 13,
                  fontFamily: "var(--crm-font-sans)",
                  color: "var(--crm-fg)",
                  outline: "none",
                }}
              />
            </label>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 10 }}>
            {[
              ["city", "City"],
              ["state", "State"],
            ].map(([name, label]) => (
              <label key={name} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--crm-fg-muted)",
                    fontWeight: 500,
                  }}
                >
                  {label}
                </span>
                <input
                  name={name}
                  maxLength={name === "state" ? 20 : undefined}
                  style={{
                    height: 34,
                    padding: "0 10px",
                    border: "1px solid var(--crm-border)",
                    borderRadius: "var(--crm-radius-sm)",
                    background: "var(--crm-surface-2)",
                    fontSize: 13,
                    fontFamily: "var(--crm-font-sans)",
                    color: "var(--crm-fg)",
                    outline: "none",
                  }}
                />
              </label>
            ))}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, color: "var(--crm-fg-muted)", fontWeight: 500 }}>
              Estimated value
            </span>
            <input
              name="value"
              type="number"
              min={0}
              step="any"
              placeholder="0"
              style={{
                height: 34,
                padding: "0 10px",
                border: "1px solid var(--crm-border)",
                borderRadius: "var(--crm-radius-sm)",
                background: "var(--crm-surface-2)",
                fontSize: 13,
                fontFamily: "var(--crm-font-sans)",
                color: "var(--crm-fg)",
                outline: "none",
              }}
            />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              type="button"
              className="crm-btn ghost"
              style={{ flex: 1, justifyContent: "center" }}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="crm-btn primary"
              style={{ flex: 1, justifyContent: "center" }}
            >
              Create lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
