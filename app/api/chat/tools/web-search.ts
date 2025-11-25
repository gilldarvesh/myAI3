import { tool } from 'ai';
import { z } from 'zod';
import Exa from 'exa-js';
import * as cheerio from 'cheerio';

const exa = new Exa(process.env.EXA_API_KEY as string);

// Very simple price regex for ₹ / Rs / INR / $
const PRICE_REGEX = /(₹|Rs\.?|INR|\$)\s?[\d,]+(\.\d{1,2})?/;

type HandbagProductInfo = {
  productName?: string;
  price?: string;
  imageUrl?: string;
};

async function scrapeHandbagPage(url: string): Promise<HandbagProductInfo | null> {
  try {
    const res = await fetch(url, {
      headers: {
        // some sites block default fetch UA
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      console.error(`Failed to fetch ${url}: ${res.status}`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // ---------- Product name ----------
    let productName: string | undefined;

    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) {
      productName = ogTitle.trim();
    } else if ($('title').text()) {
      productName = $('title').text().trim();
    }

    // ---------- Image URL ----------
    let imageUrl: string | undefined;

    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      imageUrl = ogImage.trim();
    } else {
      // fallback: first product-y looking image
      const imgSrc =
        $('img[alt*="bag" i]').attr('src') ||
        $('img[alt*="handbag" i]').attr('src') ||
        $('img').first().attr('src');

      if (imgSrc) imageUrl = imgSrc;
    }

    // ---------- Price ----------
    let price: string | undefined;

    // (a) Look for itemprop="price" or common price classes
    const priceCandidate =
      $('[itemprop="price"]').first().text().trim() ||
      $('[itemprop="price"]').first().attr('content') ||
      $('.price').first().text().trim() ||
      $('.our-price').first().text().trim() ||
      $('.a-price-whole').first().text().trim() ||
      $('.product-price').first().text().trim();

    if (priceCandidate && PRICE_REGEX.test(priceCandidate)) {
      const match = priceCandidate.match(PRICE_REGEX);
      if (match) price = match[0];
    }

    // (b) Fallback: search whole text for a price
    if (!price) {
      const fullText = $('body').text().replace(/\s+/g, ' ');
      const match = fullText.match(PRICE_REGEX);
      if (match) price = match[0];
    }

    // If we got nothing meaningful, treat as non-product page
    if (!productName && !price && !imageUrl) {
      return null;
    }

    return {
      productName,
      price,
      imageUrl,
    };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return null;
  }
}

export const webSearch = tool({
  description:
    'Search the web for up-to-date information. When the query relates to handbags, also scrape product name, price, and image.',
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
        // Optional: narrow to typical shopping sites if you want
        // includeDomains: ['amazon.in', 'myntra.com', 'ajio.com', 'nykaa.com', 'flipkart.com'],
      });

      // Scrape each result page in parallel for handbag info
      const scraped = await Promise.all(
        results.map(async (result) => {
          const handbagInfo = await scrapeHandbagPage(result.url);

          return {
            title: result.title,
            url: result.url,
            content: result.text?.slice(0, 1000) || '',
            publishedDate: result.publishedDate,
            // extra fields for handbags
            productName: handbagInfo?.productName,
            price: handbagInfo?.price,
            imageUrl: handbagInfo?.imageUrl,
          };
        })
      );

      return scraped;
    } catch (error) {
      console.error('Error searching the web:', error);
      return [];
    }
  },
});
