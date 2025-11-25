import { tool } from 'ai';
import { z } from 'zod';
import Exa from 'exa-js';

const exa = new Exa(process.env.EXA_API_KEY as string);

const PRICE_REGEX = /(₹|Rs\.?|INR|\$|€|£)\s?[\d.,]+/;

// ----- tiny HTML helpers (regex-based, no cheerio) -----

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

    // ---- product name ----
    const ogTitle = extractMetaContent(html, 'og:title');
    const titleTag = extractTagText(html, 'title');
    const productName = ogTitle || titleTag;

    // ---- image url ----
    const ogImage = extractMetaContent(html, 'og:image');
    const fallbackImg = extractFirstImageSrc(html);
    const imageUrl = ogImage || fallbackImg;

    // ---- price ----
    let price: string | undefined;
    const priceMatch = html.match(PRICE_REGEX);
    if (priceMatch) price = priceMatch[0];

    if (!productName && !price && !imageUrl) {
      // not a useful product page
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
    'Search the web for up-to-date information. When used for handbags, also tries to scrape product name, price and image.',
  inputSchema: z.object({
    query: z.string().min(1).describe('The search query'),
  }),
  execute: async ({ query }) => {
    try {
      const { results } = await exa.search(query, {
        contents: {
          text: true,
        },
        numResults: 3,
        // Optional: focus on shopping domains
        // includeDomains: ['amazon.in', 'myntra.com', 'ajio.com', 'nykaa.com', 'flipkart.com'],
      });

      const enriched = await Promise.all(
        results.map(async (result) => {
          const productInfo = await scrapeHandbagPage(result.url);

          return {
            title: result.title,
            url: result.url,
            content: result.text?.slice(0, 1000) || '',
            publishedDate: result.publishedDate,
            productName: productInfo?.productName,
            price: productInfo?.price,
            imageUrl: productInfo?.imageUrl,
          };
        })
      );

      return enriched;
    } catch (error) {
      console.error('Error searching the web:', error);
      return [];
    }
  },
});
