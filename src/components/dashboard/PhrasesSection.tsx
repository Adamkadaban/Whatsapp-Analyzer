import type { PersonPhrases } from "../../lib/types";

interface PhrasesSectionProps {
  perPersonPhrases: PersonPhrases[];
}

/**
 * Section showing top phrases per sender.
 */
export default function PhrasesSection({ perPersonPhrases }: PhrasesSectionProps) {
  return (
    <div className="card grid-gap-sm">
      <div className="tag">By person</div>
      <h3 className="card-header">Top phrases per sender</h3>
      {perPersonPhrases.length === 0 ? (
        <div className="text-muted">No phrases yet.</div>
      ) : (
        <div className="phrases-grid">
          {perPersonPhrases.map((person) => (
            <div key={person.name} className="phrase-person-card">
              <div className="phrase-person-header">
                <span className="font-bold">{person.name}</span>
                <span className="text-muted text-xs">
                  Top {Math.min(person.phrases.length, 5)}
                </span>
              </div>
              {person.phrases.length === 0 ? (
                <span className="text-muted text-sm">No phrases</span>
              ) : (
                <div className="phrase-list">
                  {person.phrases.slice(0, 5).map((p, idx) => (
                    <div key={p.label + idx} className="phrase-item">
                      <span className="text-muted font-semibold">#{idx + 1}</span>
                      <span className="font-semibold">{p.label}</span>
                      <span className="text-right text-muted">{p.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
