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
  name?: string;
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
    const name = ogTitle || titleTag;

    // Image URL
    const ogImage = extractMetaContent(html, 'og:image');
    const fallbackImg = extractFirstImageSrc(html);
    const imageUrl = ogImage || fallbackImg;

    // Price
    let price: string | undefined;
    const priceMatch = html.match(PRICE_REGEX);
    if (priceMatch) price = priceMatch[0];

    if (!name && !price && !imageUrl) {
      // Not a meaningful product page
      return null;
    }

    return { name, price, imageUrl };
  } catch (err) {
    console.error(`Error scraping ${url}:`, err);
    return null;
  }
}

export const webSearch = tool({
  description:
    'Given a natural language description (style, budget, use-case), recommend 4–5 handbags with name, price, image, and link.',
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe('Natural language description of the handbag you want'),
  }),
  execute: async ({ query }) => {
    try {
      // Always treat this as a handbag-discovery query.
      // User can be very vague: “good handbag pls”, “something for office under 3000”, etc.
      const expandedQuery = `${query} women's handbag bag purse tote crossbody buy online`;

      const { results } = await exa.search(expandedQuery, {
        contents: {
          text: true,
        },
        type: 'neural',
        numResults: 20, // fetch more, then filter to top 4–5
        // Optional: bias to shopping sites you like:
        // includeDomains: ['amazon.in', 'myntra.com', 'ajio.com', 'nykaa.com', 'flipkart.com'],
      });

      const scraped = await Promise.all(
        results.map(async (result) => {
          const info = await scrapeHandbagPage(result.url);
          if (!info) return null;

          return {
            url: result.url,
            name: info.name || result.title,
            price: info.price || null,
            imageUrl: info.imageUrl || null,
          };
        })
      );

      // Filter out bad/null entries
      const valid = scraped.filter(
        (p): p is NonNullable<typeof p> => !!p
      );

      // Sort so that items *with* images and prices appear first
      const sorted = valid.sort((a, b) => {
        const scoreA = (a.imageUrl ? 1 : 0) + (a.price ? 1 : 0);
        const scoreB = (b.imageUrl ? 1 : 0) + (b.price ? 1 : 0);
        return scoreB - scoreA;
      });

      // Pick up to 5 best candidates
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
