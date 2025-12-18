import type { Journey } from "../../lib/types";
import MessageBubble from "./MessageBubble";
import { CHART_COLORS } from "../../lib/colors";

const colors = CHART_COLORS;

interface JourneySectionProps {
  journey: Journey;
  colorMap: Record<string, string>;
}

/**
 * Journey section showing message history highlights.
 */
export default function JourneySection({ journey, colorMap }: JourneySectionProps) {
  const getColor = (sender: string, idx: number) =>
    colorMap[sender] || colors[idx % colors.length];

  return (
    <div className="card journey-section">
      <h2 className="journey-title">Journey Through Your Messages</h2>

      {/* Overview stats */}
      <div className="journey-highlights">
        <div className="flex-col-end">
          <div className="journey-highlight-value text-primary">
            {journey.total_messages.toLocaleString()}
          </div>
          <div className="journey-highlight-label">messages</div>
        </div>
        <div className="flex-col-end">
          <div className="journey-highlight-value text-accent">
            {journey.total_days.toLocaleString()}
          </div>
          <div className="journey-highlight-label">days</div>
        </div>
        <div className="flex-col-end">
          <div className="journey-highlight-value nowrap">{journey.first_day}</div>
          <div className="journey-highlight-label">first message</div>
        </div>
        <div className="flex-col-end">
          <div className="journey-highlight-value nowrap">{journey.last_day}</div>
          <div className="journey-highlight-label">last message</div>
        </div>
      </div>

      {/* First message */}
      <div className="journey-subsection">
        <h3 className="journey-subsection-title">Where it all began</h3>
        <p className="journey-subsection-desc">Your conversation started with:</p>
        <div className="journey-moment-card">
          <div>
            {journey.first_messages.map((msg, idx) => (
              <MessageBubble
                key={idx}
                message={msg}
                senderColor={getColor(msg.sender, idx)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Interesting moments */}
      {journey.interesting_moments.length > 0 && (
        <div className="journey-subsection">
          <h3 className="journey-moments-title">Memorable moments</h3>
          <div className="grid-gap-xl">
            {journey.interesting_moments.map((moment, idx) => (
              <div key={idx} className="journey-moment-card">
                <div className="journey-moment-header">
                  <div className="journey-moment-title">{moment.title}</div>
                  <div className="journey-moment-desc">{moment.description}</div>
                </div>
                <div>
                  {moment.messages.map((msg, msgIdx) => (
                    <MessageBubble
                      key={msgIdx}
                      message={msg}
                      senderColor={getColor(msg.sender, msgIdx)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last message */}
      <div className="journey-subsection">
        <h3 className="journey-subsection-title">The latest chapter</h3>
        <p className="journey-subsection-desc">Your most recent messages:</p>
        <div className="journey-moment-card">
          <div>
            {journey.last_messages.map((msg, idx) => (
              <MessageBubble
                key={idx}
                message={msg}
                senderColor={getColor(msg.sender, idx)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
