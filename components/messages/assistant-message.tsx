import { UIMessage, ToolCallPart, ToolResultPart } from "ai";
import { Response } from "@/components/ai-elements/response";
import { ReasoningPart } from "./reasoning-part";
import { ToolCall, ToolResult } from "./tool-call";

type HandbagProduct = {
  name: string;
  price?: string;
  imageUrl?: string;
  url: string;
  store?: string;
};

function extractHandbagProductsFromToolResult(part: ToolResultPart): HandbagProduct[] {
  try {
    const output = (part as any).output;

    // 🔴 ASSUMPTION ZONE:
    // Adjust this to match your actual tool output shape.
    //
    // Example 1: output = { products: [...] }
    if (output && Array.isArray(output.products)) {
      return output.products.map((p: any) => ({
        name: p.name ?? "",
        price: p.price,
        imageUrl: p.imageUrl,
        url: p.url ?? "",
        store: p.store || p.domain,
      })).filter(p => p.name && p.url);
    }

    // Example 2: output = [...]
    if (Array.isArray(output)) {
      return output.map((p: any) => ({
        name: p.name ?? "",
        price: p.price,
        imageUrl: p.imageUrl,
        url: p.url ?? "",
        store: p.store || p.domain,
      })).filter(p => p.name && p.url);
    }

    return [];
  } catch {
    return [];
  }
}

export function AssistantMessage({ message, status, isLastMessage, durations, onDurationChange }: { message: UIMessage; status?: string; isLastMessage?: boolean; durations?: Record<string, number>; onDurationChange?: (key: string, duration: number) => void }) {
    return (
        <div className="w-full">
            <div className="text-sm flex flex-col gap-4">
                {message.parts.map((part, i) => {
                    const isStreaming = status === "streaming" && isLastMessage && i === message.parts.length - 1;
                    const durationKey = `${message.id}-${i}`;
                    const duration = durations?.[durationKey];

                    if (part.type === "text") {
                        return <Response key={`${message.id}-${i}`}>{part.text}</Response>;
                    } else if (part.type === "reasoning") {
                        return (
                            <ReasoningPart
                                key={`${message.id}-${i}`}
                                part={part}
                                isStreaming={isStreaming}
                                duration={duration}
                                onDurationChange={onDurationChange ? (d) => onDurationChange(durationKey, d) : undefined}
                            />
                        );
                    } else if (
                        part.type.startsWith("tool-") || part.type === "dynamic-tool"
                    ) {
                        if ('state' in part && part.state === "output-available") {
                            return (
                                <ToolResult
                                    key={`${message.id}-${i}`}
                                    part={part as unknown as ToolResultPart}
                                />
                            );
                        } else {
                            return (
                                <ToolCall
                                    key={`${message.id}-${i}`}
                                    part={part as unknown as ToolCallPart}
                                />
                            );
                        }
                    }
                    return null;
                })}
            </div>
        </div>
    )
}
