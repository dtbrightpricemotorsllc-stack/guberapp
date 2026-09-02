import { RepairMatchHome } from "@/components/repairmatch/customer-home";
import { EstimateDetail } from "@/components/repairmatch/estimate-detail";
import { NewEstimate } from "@/components/repairmatch/estimate-creation";
import { ShopOpportunity } from "@/components/repairmatch/shop-opportunity";
import { ShopWorkspace } from "@/components/repairmatch/shop-workspace";

export default function RepairMatch() {
  const path = window.location.pathname;
  if (path === "/repairmatch/new") return <NewEstimate />;
  if (path.startsWith("/repairmatch/") && path !== "/repairmatch/new") return <EstimateDetail />;
  if (path === "/biz/repairmatch") return <ShopWorkspace />;
  if (path.startsWith("/biz/repairmatch/")) return <ShopOpportunity />;
  return <RepairMatchHome />;
}