/**
 * The price, declared once. Until this package existed "$59" was written out
 * in five places — three site pages, both desktop prompt loaders — and a
 * price change would have had to find them all. The site interpolates
 * `formattedPrice` at build time, the desktop app hands it to the prompt
 * cards as their `price` prop, and /price.json serializes `pricing` so a
 * future runtime consumer can read the current price without shipping a
 * new build.
 *
 * `launchPrice` is the optional promotional price the standing one is struck
 * through to; null means no promotion is running and consumers render the
 * standing price alone.
 */

export const pricing: {
  price: number;
  launchPrice: number | null;
  currency: string;
} = {
  price: 59,
  launchPrice: null,
  currency: "USD",
};

export const formattedPrice = `$${pricing.price}`;

export const formattedLaunchPrice =
  pricing.launchPrice === null ? null : `$${pricing.launchPrice}`;
