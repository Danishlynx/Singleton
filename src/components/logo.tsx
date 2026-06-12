/**
 * The Singleton mark: a ticket badge (notched sides, like the perforated
 * counterfoil on the receipt page) holding exactly one punched dot — a
 * singleton is the set with exactly one element, and this is the ticket that
 * can only ever be issued once. Drawn with theme tokens so it follows the
 * palette; app/icon.svg is the same mark with literal colors for the favicon.
 */
export function SingletonMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <mask id="singleton-notch">
        <rect width="32" height="32" fill="white" />
        <circle cx="0" cy="16" r="3.75" fill="black" />
        <circle cx="32" cy="16" r="3.75" fill="black" />
      </mask>
      <rect width="32" height="32" rx="7" className="fill-primary" mask="url(#singleton-notch)" />
      <circle cx="16" cy="16" r="4.25" className="fill-primary-foreground" />
    </svg>
  );
}
