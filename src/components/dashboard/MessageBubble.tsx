import type { JourneyMessage } from "../../lib/types";

/** Format ISO timestamp to readable time */
function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

interface MessageBubbleProps {
  message: JourneyMessage;
  senderColor: string;
}

/** WhatsApp-style message bubble */
export default function MessageBubble({ message, senderColor }: MessageBubbleProps) {
  const bubbleStyle = {
    maxWidth: "80%",
    padding: "8px 12px",
    borderRadius: message.is_you ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
    background: message.is_you
      ? "linear-gradient(135deg, #005c4b, #004d40)"
      : "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.06)",
    position: "relative" as const,
  };

  return (
    <div className={`flex-center mb-sm ${message.is_you ? "justify-end" : ""}`}>
      <div style={bubbleStyle}>
        <div className="journey-message-sender" style={{ color: senderColor }}>
          {message.sender}
        </div>
        <div className="journey-message-text">{message.text}</div>
        <div className="journey-message-meta text-right">
          {formatMessageTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
