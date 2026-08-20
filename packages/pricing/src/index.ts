/**
 * The baked price, declared once. Until this package existed "$59" was
 * written out in five places — three site pages, both desktop prompt loaders
 * — and a price change would have had to find them all. Polar is the display
 * source of truth for the site: apps/web resolves the live price at build
 * time (src/lib/pricing.ts) and reaches for these constants only when that
 * resolution is impossible. The desktop app ships them as its baked value
 * until a runtime fetch of /price.json lands.
 *
 * `launchPrice` is the optional promotional price the standing one is struck
 * through to; null means no promotion is running and consumers render the
 * standing price alone. `formattedEffectivePrice` is the one a buyer pays
 * today, which is what the desktop prompts quote.
 */

export const pricing: {
  price: number;
  launchPrice: number | null;
  currency: string;
} = {
  price: 59,
  launchPrice: 39,
  currency: "USD",
};

export const formatPrice = (amount: number): string =>
  Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;

export const formattedPrice = formatPrice(pricing.price);

export const formattedLaunchPrice =
  pricing.launchPrice === null ? null : formatPrice(pricing.launchPrice);

export const formattedEffectivePrice = formattedLaunchPrice ?? formattedPrice;
