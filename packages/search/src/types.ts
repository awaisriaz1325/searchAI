import type { Facts, Portal } from '@searchai/core';

export interface Hit {
  id: number;
  score?: number;
}

export interface ListingRow {
  id: number;
  portal: Portal;
  title: string;
  description: string;
  lang: string;
  priceMinor: number;
  lat: number;
  lon: number;
  facts: Partial<Facts> & Record<string, unknown>;
  score?: number;
}
