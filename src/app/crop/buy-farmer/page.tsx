"use client";

import { CropPurchaseSlip } from "@/components/crop/CropPurchaseSlip";

export default function BuyCropFromFarmerPage() {
  return (
    <CropPurchaseSlip
      partyType="customer"
      title="Buy from farmer"
      subtitle="One slip for the trolley. Kaat is on each vehicle. The five charges sit under the vehicles."
    />
  );
}
