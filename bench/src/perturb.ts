import type { GeneratedListing, Rng } from '@searchai/datagen';

/** The fact that most shapes what a listing is about, per portal. */
const KIND: Record<string, string> = { cars: 'body', homes: 'type', rentals: 'type', jobs: 'role', marketplace: 'category' };
const kindOf = (l: GeneratedListing) => `${l.portal}:${String((l.facts as Record<string, unknown>)[KIND[l.portal]!])}`;

/**
 * Scale vectors without running the model 2M times: each synthetic listing borrows the real
 * embedding of a random real listing with the same portal and kind (a van borrows a van's),
 * plus noise of relative norm `noise`, re-normalised. Cosine to the source is 1/sqrt(1+noise²)
 * (0.94 at the default), so neighbourhoods keep the shape of real e5 embeddings instead of the
 * isotropic noise that makes ANN recall look worse than it is.
 */
export function perturbFrom(
  real: { listing: GeneratedListing; vector: Float32Array }[],
  rng: Rng,
  noise = 0.35,
): (l: GeneratedListing) => { vector: Float32Array; sourceId: number } {
  const byKind = new Map<string, typeof real>();
  const byPortal = new Map<string, typeof real>();
  for (const r of real) {
    (byKind.get(kindOf(r.listing)) ?? byKind.set(kindOf(r.listing), []).get(kindOf(r.listing))!).push(r);
    (byPortal.get(r.listing.portal) ?? byPortal.set(r.listing.portal, []).get(r.listing.portal)!).push(r);
  }
  return (l) => {
    const pool = byKind.get(kindOf(l)) ?? byPortal.get(l.portal)!;
    const src = rng.pick(pool);
    const dim = src.vector.length;
    const n = Float32Array.from({ length: dim }, () => rng.normal(0, 1));
    const nNorm = Math.hypot(...n);
    const v = src.vector.map((x, i) => x + (noise * n[i]!) / nNorm);
    const vNorm = Math.hypot(...v);
    return { vector: v.map((x) => x / vNorm), sourceId: src.listing.id };
  };
}
