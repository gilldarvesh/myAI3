// components/ai-elements/handbag-grid.tsx
import Image from "next/image";

export type HandbagProduct = {
  name: string;
  price?: string;
  imageUrl?: string;
  url: string;
  store?: string;
};

export function HandbagGrid({ products }: { products: HandbagProduct[] }) {
  if (!products?.length) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p, i) => (
        <div
          key={i}
          onClick={() => window.open(p.url, "_blank")}
          className="cursor-pointer border rounded-lg p-3 bg-card shadow-sm hover:shadow-md transition flex flex-col gap-2"
        >
          {p.imageUrl && (
            <div className="relative w-full pb-[75%] bg-muted rounded-md overflow-hidden">
              <Image src={p.imageUrl} alt={p.name} fill className="object-cover" />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium line-clamp-2">{p.name}</div>
            {p.price && <div className="text-sm font-semibold text-emerald-600">{p.price}</div>}
            {p.store && <div className="text-xs text-muted-foreground">{p.store}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
