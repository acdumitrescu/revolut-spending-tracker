import { describeUnconverted } from './dashboardFormat';

/** Visible whenever a selector left amounts out for lack of an exchange rate. */
export default function UnconvertedNote({ lists }) {
  const text = describeUnconverted(...lists);
  if (!text) return null;
  return <p className="dash-note dash-note-warn">{text}</p>;
}
