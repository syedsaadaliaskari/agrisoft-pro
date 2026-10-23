"use client";

import { CropPurchaseSlip } from "@/components/crop/CropPurchaseSlip";

export default function BuyCropFromSupplierPage() {
  return (
    <CropPurchaseSlip
      partyType="vendor"
      title="Buy from supplier"
    />
  );
}
