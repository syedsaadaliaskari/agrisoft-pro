"use client";

import { CropPurchaseSlip } from "@/components/crop/CropPurchaseSlip";

export default function BuyCropFromSupplierPage() {
  return (
    <CropPurchaseSlip
      partyType="vendor"
      title="Buy from supplier"
      subtitle="Same crop slip, posted on the supplier khata."
    />
  );
}
