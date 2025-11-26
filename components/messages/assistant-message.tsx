import { UIMessage, ToolCallPart, ToolResultPart } from "ai";
import { Response } from "@/components/ai-elements/response";
import { ReasoningPart } from "./reasoning-part";
import { ToolCall, ToolResult, extractToolName } from "./tool-call";
import { HandbagGrid, HandbagProduct } from "@/components/ai-elements/handbag-grid";

// Extract handbag products from webSearch tool output
function extractHandbagProducts(part: any): HandbagProduct[] {
    try {
        const output = part.output;

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

export function AssistantMessage({
    message,
    status,
    isLastMessage,
    durations,
    onDurationChange,
}: {
    message: UIMessage;
    status?: string;
    isLastMessage?: boolean;
    durations?: Record<string, number>;
    onDurationChange?: (key: string, duration: number) => void;
}) {
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

                    if (part.type === "text") {
                        return (
                            <Response key={`${message.id}-${i}`}>
                                {part.text}
                            </Response>
                        );
                    }

                    if (part.type === "reasoning") {
                        return (
                            <ReasoningPart
                                key={`${message.id}-${i}`}
                                part={part}
                                isStreaming={isStreaming}
                                duration={duration}
                                onDurationChange={
                                    onDurationChange
                                        ? (d) =>
                                              onDurationChange(
                                                  durationKey,
                                                  d
                                              )
                                        : undefined
                                }
                            />
                        );
                    }

                    // TOOL HANDLING (CALL + RESULT)
                    if (
                        part.type.startsWith("tool-") ||
                        part.type === "dynamic-tool"
                    ) {
                        const toolName = extractToolName(
                            part as ToolCallPart | ToolResultPart
                        );

                        // 🔥 When output is available → show product cards
                        if ("state" in part && part.state === "output-available") {
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

                            // fallback to default tool UI
                            return (
                                <ToolResult
                                    key={`${message.id}-${i}`}
                                    part={part as ToolResultPart}
                                />
                            );
                        }

                        // Tool still running
                        return (
                            <ToolCall
                                key={`${message.id}-${i}`}
                                part={part as ToolCallPart}
                            />
                        );
                    }

                    return null;
                })}
            </div>
        </div>
    );
}
