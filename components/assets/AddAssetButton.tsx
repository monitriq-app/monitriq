"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { AssetType } from "@/lib/domain/assets/types";
import type { Currency } from "@/lib/domain/currency/types";
import { AddAssetSheet } from "@/components/assets/AddAssetSheet";

interface AddAssetButtonProps {
  assetTypes: AssetType[];
  currencies: Currency[];
  defaultCurrencyCode: string | null;
}

export function AddAssetButton({ assetTypes, currencies, defaultCurrencyCode }: AddAssetButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent-primary px-4 text-sm font-semibold text-background shadow-[0_0_16px_color-mix(in_srgb,var(--color-accent-primary)_30%,transparent)]"
      >
        <Plus size={18} aria-hidden="true" />
        Add Asset
      </button>
      {open ? <AddAssetSheet assetTypes={assetTypes} currencies={currencies} defaultCurrencyCode={defaultCurrencyCode} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
