import WordCloud from "../WordCloud";

interface WordCloudCardProps {
  words: { label: string; value: number }[];
  colors: string[];
}

/**
 * Card wrapper around the (untouched) WordCloud visual.
 */
export default function WordCloudCard({ words, colors }: WordCloudCardProps) {
  return (
    <div className="card grid-gap-sm min-h-card">
      <div className="tag">Word cloud</div>
      <h3 className="card-header">Most common words</h3>
      <WordCloud words={words} colors={colors} height={320} />
    </div>
  );
}
