import EmojiCloud from "../EmojiCloud";

interface EmojiCloudCardProps {
  words: { label: string; value: number }[];
}

/**
 * Card wrapper around the (untouched) EmojiCloud visual.
 */
export default function EmojiCloudCard({ words }: EmojiCloudCardProps) {
  return (
    <div className="card grid-gap-sm min-h-card">
      <div className="tag">Emoji cloud</div>
      <h3 className="card-header">Most used emojis</h3>
      <EmojiCloud words={words} height={320} />
    </div>
  );
}
