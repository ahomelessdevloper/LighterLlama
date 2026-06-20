import { COMPARE_TABS, navigateCompareTab, type CompareTabId } from "../lib/compareNav";
import { VenueDuel } from "./VenueBrand";

interface CompareSidebarProps {
  active: CompareTabId;
}

export function CompareSidebar({ active }: CompareSidebarProps) {
  return (
    <div className="compare-picker">
      <form className="compare-picker__form" onSubmit={(e) => e.preventDefault()}>
        <div className="compare-picker__row">
          <VenueDuel className="compare-picker__duel" size="sm" showNames={false} />
          <div className="compare-picker__field">
            <label htmlFor="compare-section-select" className="compare-picker__label">
              Section
            </label>
            <select
              id="compare-section-select"
              className="compare-picker__select"
              value={active}
              onChange={(e) => navigateCompareTab(e.target.value as CompareTabId)}
              aria-label="Compare section"
            >
              {COMPARE_TABS.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>
    </div>
  );
}