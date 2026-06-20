import { useEffect, useState, type ComponentType } from "react";
import { CompareSidebar } from "../components/CompareSidebar";
import { SiteNav, type SiteView } from "../components/SiteNav";
import {
  compareTabHash,
  getCompareTabFromHash,
  type CompareTabId,
} from "../lib/compareNav";
import BookDepthPage from "./compare/BookDepthPage";
import ExecutionCostPage from "./compare/ExecutionCostPage";
import PePage from "./compare/PePage";
import LlpHlpPage from "./compare/LlpHlpPage";
import StakingPage from "./compare/StakingPage";
import UsersPositionsPage from "./compare/UsersPositionsPage";
import BuybacksPage from "./compare/BuybacksPage";


interface CompareHubProps {
  onNavigate: (view: SiteView) => void;
}

const PAGES: Record<CompareTabId, ComponentType> = {
  "book-depth": BookDepthPage,
  "execution-cost": ExecutionCostPage,
  pe: PePage,
  "llp-hlp": LlpHlpPage,
  staking: StakingPage,
  "users-positions": UsersPositionsPage,
  buybacks: BuybacksPage,
};

export default function CompareHub({ onNavigate }: CompareHubProps) {
  const [tab, setTab] = useState<CompareTabId>(getCompareTabFromHash);

  useEffect(() => {
    const onHashChange = () => {
      const next = getCompareTabFromHash();
      setTab(next);
      if (window.location.hash === "#compare") {
        window.location.replace(compareTabHash("book-depth"));
      }
    };
    onHashChange();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const Page = PAGES[tab];

  return (
    <div className="min-h-screen bg-[#0a0b12] text-white">
      <SiteNav active="compare" onNavigate={onNavigate} />
      <div className="compare-shell w-full min-w-0 max-w-[1440px] mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-10 sm:pb-14">
        <CompareSidebar active={tab} />
        <main className="compare-main">{Page && <Page />}</main>
      </div>
    </div>
  );
}