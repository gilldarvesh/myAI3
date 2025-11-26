// components/messages/assistant-message.tsx
import { UIMessage, ToolCallPart, ToolResultPart } from "ai";
import { Response } from "@/components/ai-elements/response";
import { ReasoningPart } from "./reasoning-part";
import { ToolCall, ToolResult, extractToolName } from "./tool-call";
import {
  HandbagGrid,
  HandbagProduct,
} from "@/components/ai-elements/handbag-grid";

// Try to turn a tool result into a list of handbag products
function extractHandbagProducts(part: any): HandbagProduct[] {
  try {
    const output = part.output;

    // Case 1: output is already an array of products
    if (Array.isArray(output)) {
      return output
        .map((p: any) => ({
          name: p.name ?? "",
          price: p.price,
          imageUrl: p.imageUrl,
          url: p.url ?? "",
          store: p.store ?? p.domain ?? "",
        }))
        .filter((p: HandbagProduct) => p.name && p.url);
    }

    // Case 2: output has a `products` array
    if (output?.products && Array.isArray(output.products)) {
      return output.products
        .map((p: any) => ({
          name: p.name ?? "",
          price: p.price,
          imageUrl: p.imageUrl,
          url: p.url ?? "",
          store: p.store ?? p.domain ?? "",
        }))
        .filter((p: HandbagProduct) => p.name && p.url);
    }

    return [];
  } catch {
    return [];
  }
}

export function AssistantMessage(props: {
  message: UIMessage;
  status?: string;
  isLastMessage?: boolean;
  durations?: Record<string, number>;
  onDurationChange?: (key: string, duration: number) => void;
}) {
  const { message, status, isLastMessage, durations, onDurationChange } = props;

  return (
    <div className="w-full">
      <div className="text-sm flex flex-col gap-4">
        {message.parts.map((part, i) => {
          const isStreaming =
            status === "streaming" &&
            isLastMessage &&
            i === message.parts.length - 1;
          const durationKey = `${message.id}-${i}`;
          const duration = durations?.[durationKey];

          // Normal text from the assistant
          if (part.type === "text") {
            return (
              <Response key={`${message.id}-${i}`}>{part.text}</Response>
            );
          }

          // Reasoning UI
          if (part.type === "reasoning") {
            return (
              <ReasoningPart
                key={`${message.id}-${i}`}
                part={part}
                isStreaming={isStreaming}
                duration={duration}
                onDurationChange={
                  onDurationChange
                    ? (d) => onDurationChange(durationKey, d)
                    : undefined
                }
              />
            );
          }

          // Tool calls and results
          if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
            const toolName = extractToolName(part as any);

            // Tool result is ready
            if ("state" in part && part.state === "output-available") {
              // Special case: webSearch → try to show handbag cards
              if (toolName === "webSearch") {
                const products = extractHandbagProducts(part);
                if (products.length > 0) {
                  return (
                    <HandbagGrid
                      key={`${message.id}-${i}`}
                      products={products}
                    />
                  );
                }
              }

              // Fallback: normal tool result row
              return (
                <ToolResult
                  key={`${message.id}-${i}`}
                  part={part as unknown as ToolResultPart}
                />
              );
            }

            // Tool is still running
            return (
              <ToolCall
                key={`${message.id}-${i}`}
                part={part as unknown as ToolCallPart}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
