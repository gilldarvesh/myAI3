import { tool } from 'ai';
import { z } from 'zod';
import Exa from 'exa-js';

const exa = new Exa(process.env.EXA_API_KEY as string);

// Simple price regex (₹, Rs, INR, $, €, £)
const PRICE_REGEX = /(₹|Rs\.?|INR|\$|€|£)\s?[\d.,]+/;

// ---- Tiny HTML helpers (regex-based, no extra deps) ----

function extractMetaContent(html: string, property: string): string | undefined {
  const metaRegex = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]*>`,
    'i'
  );
  const tagMatch = html.match(metaRegex)?.[0];
  if (!tagMatch) return;

  const contentMatch = tagMatch.match(/content=["']([^"']+)["']/i);
  return contentMatch?.[1]?.trim();
}

function extractTagText(html: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i');
  const m = html.match(regex);
  return m?.[1]?.trim();
}

function extractFirstImageSrc(html: string): string | undefined {
  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  return imgMatch?.[1]?.trim();
}

type HandbagProductInfo = {
  productName?: string;
  price?: string;
  imageUrl?: string;
};

async function scrapeHandbagPage(url: string): Promise<HandbagProductInfo | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      console.error(`Failed to fetch ${url}: ${res.status}`);
      return null;
    }

    const html = await res.text();

    // Product name
    const ogTitle = extractMetaContent(html, 'og:title');
    const titleTag = extractTagText(html, 'title');
    const productName = ogTitle || titleTag;

    // Image URL
    const ogImage = extractMetaContent(html, 'og:image');
    const fallbackImg = extractFirstImageSrc(html);
    const imageUrl = ogImage || fallbackImg;

    // Price
    let price: string | undefined;
    const priceMatch = html.match(PRICE_REGEX);
    if (priceMatch) price = priceMatch[0];

    if (!productName && !price && !imageUrl) {
      // Not a useful product page
      return null;
    }

    return { productName, price, imageUrl };
  } catch (err) {
    console.error(`Error scraping ${url}:`, err);
    return null;
  }
}

export const webSearch = tool({
  description:
    'Given a vague natural language description (style, budget, use-case), recommend 4–5 handbags with name, price, image, and link.',
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe('Natural language description of the handbag you want'),
  }),
  execute: async ({ query }) => {
    try {
      // Always treat this as a handbag-discovery query.
      // We keep the user’s vague description, but reinforce it with handbag keywords.
      const expandedQuery = `${query} women's handbag bag purse tote crossbody buy online`;

      const { results } = await exa.search(expandedQuery, {
        contents: {
          text: true,
        },
        type: 'neural',
        numResults: 15, // fetch more, then filter to 4–5 good ones
        // Optionally bias to shopping sites:
        // includeDomains: ['amazon.in', 'myntra.com', 'ajio.com', 'nykaa.com', 'flipkart.com'],
      });

      const scraped = await Promise.all(
        results.map(async (result) => {
          const info = await scrapeHandbagPage(result.url);
          if (!info) return null;

          return {
            title: result.title,
            url: result.url,
            name: info.productName || result.title,
            price: info.price || null,
            imageUrl: info.imageUrl || null,
          };
        })
      );

      // Keep only items that have an image (for clickable cards)
      const valid = scraped.filter(
        (p): p is NonNullable<typeof p> => !!p && !!p.imageUrl
      );

      // Prefer ones with price first
      const sorted = valid.sort((a, b) => {
        const aHasPrice = a.price ? 1 : 0;
        const bHasPrice = b.price ? 1 : 0;
        return bHasPrice - aHasPrice;
      });

      const topPicks = sorted.slice(0, 5);

      return {
        query,
        items: topPicks,
      };
    } catch (error) {
      console.error('Error searching the web:', error);
      return {
        query,
        items: [],
      };
    }
  },
});
