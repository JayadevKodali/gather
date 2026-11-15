/**
 * Accessibility & amenities on the brief page, in collapsible groups. Each group's heading says how many
 * of its facilities are selected, and groups with a selection start open. Each facility can be
 * Any / Preferred / Essential. Field names and ids (fac_<code>) are unchanged.
 */
import { AV_HELP, FACILITY_GROUPS, type FacilityCode, type Preference } from "@/lib/domain";
import { FacilityIcon } from "./FacilityIcon";

export function FacilityPicker({ selected }: { selected: Partial<Record<FacilityCode, Preference>> }) {
  const count = Object.keys(selected).length;
  return (
    <section className="facility-groups" aria-labelledby="facilities-title">
      <div className="spread">
        <h3 id="facilities-title" className="mb-0">Accessibility &amp; amenities</h3>
        <span className="small muted">{count === 0 ? "None selected" : `${count} selected`}</span>
      </div>
      <p className="small muted mt-s">Essential means we only show venues that have confirmed it. Preferred helps a venue rank higher.</p>
      {FACILITY_GROUPS.map((group) => {
        const n = group.items.filter(([code]) => selected[code]).length;
        return (
          <details key={group.name} className="disclosure facility-group" open={n > 0}>
            <summary>
              <span>{group.name}</span>
              <span className={`group-count ${n ? "on" : ""}`}>{n === 0 ? "None selected" : `${n} selected`}</span>
            </summary>
            <div className="inner">
              <div className="facility-grid">
                {group.items.map(([code, label]) => (
                  <div key={code} className="facility-row">
                    <label htmlFor={`fac_${code}`} style={{ margin: 0, fontWeight: 500, display: "flex", gap: 8, alignItems: "center" }}><FacilityIcon code={code} />{label}</label>
                    <select id={`fac_${code}`} name={`fac_${code}`} defaultValue={selected[code] ?? ""}>
                      <option value="">Any</option>
                      <option value="preferred">Preferred</option>
                      <option value="essential">Essential</option>
                    </select>
                  </div>
                ))}
              </div>
              {group.name === "Event technology" && (
                <details className="mt-s">
                  <summary className="small" style={{ cursor: "pointer", color: "var(--forest)" }}>What counts as general AV?</summary>
                  <p className="small muted mt-s">{AV_HELP}</p>
                </details>
              )}
            </div>
          </details>
        );
      })}
    </section>
  );
}
