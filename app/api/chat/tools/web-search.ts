import { tool } from 'ai';
import { z } from 'zod';
import Exa from 'exa-js';

const exa = new Exa(process.env.EXA_API_KEY as string);

// Simple price regex (supports ₹, Rs, INR, $, €, £)
const PRICE_REGEX = /(₹|Rs\.?|INR|\$|€|£)\s?[\d.,]+/;

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

function isHandbagQuery(query: string): boolean {
  return /\b(bag|handbag|tote|sling|satchel|backpack|hobo|crossbody)\b/i.test(
    query
  );
}

export const webSearch = tool({
  description:
    'Search the web for up-to-date information. For handbag queries, returns 4–5 product recommendations with image, price, and link.',
  inputSchema: z.object({
    query: z.string().min(1).describe('The search query'),
  }),
  execute: async ({ query }) => {
    try {
      const handbagMode = isHandbagQuery(query);

      // If it looks like a handbag query, bias the search accordingly
      const searchQuery = handbagMode
        ? `${query} buy online handbag`
        : query;

      const { results } = await exa.search(searchQuery, {
        contents: {
          text: true,
        },
        numResults: handbagMode ? 12 : 3, // fetch more for handbag mode
        // You *can* narrow to shopping sites if you want:
        // includeDomains: ['amazon.in', 'myntra.com', 'ajio.com', 'nykaa.com', 'flipkart.com'],
      });

      if (!handbagMode) {
        // Default behavior: same as your original tool
        return {
          type: 'generic',
          query,
          items: results.map((result) => ({
            title: result.title,
            url: result.url,
            content: result.text?.slice(0, 1000) || '',
            publishedDate: result.publishedDate,
          })),
        };
      }

      // Handbag mode: scrape pages, then pick 4–5 strongest
      const scraped = await Promise.all(
        results.map(async (result) => {
          const productInfo = await scrapeHandbagPage(result.url);
          if (!productInfo) return null;

          return {
            title: result.title,
            url: result.url,
            productName: productInfo.productName || result.title,
            price: productInfo.price || null,
            imageUrl: productInfo.imageUrl || null,
          };
        })
      );

      const validProducts = scraped.filter(
        (p): p is NonNullable<typeof p> => !!p && !!p.imageUrl
      );

      // Take top 4–5 with images (price may be null for some sites)
      const topPicks = validProducts.slice(0, 5);

      return {
        type: 'handbags',
        query,
        items: topPicks,
      };
    } catch (error) {
      console.error('Error searching the web:', error);
      return {
        type: 'error',
        query,
        items: [],
      };
    }
  },
});
