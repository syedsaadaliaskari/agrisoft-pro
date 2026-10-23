"use client";

import { CropPurchaseSlip } from "@/components/crop/CropPurchaseSlip";

export default function BuyCropFromFarmerPage() {
  return (
    <CropPurchaseSlip
      partyType="customer"
      title="Buy from farmer"
    />
  );
}
