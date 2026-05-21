export default function ArticleHead() {
  return (
    <section className="bs-hero">
      <div className="bs-hero-head">
        <p className="bs-eyebrow">A REAL INTERNET RADIO STATION</p>
        <h1 className="bs-hero-title">
          The radio station with a DJ who never sleeps.
        </h1>
        <p className="bs-hero-deck">
          One stream, an LLM behind the desk, and a music library that already
          belongs to you. We spent a week tuned in to find out what a personal
          radio station actually feels like.
        </p>
      </div>

      <div className="mb-0 flex flex-wrap items-baseline justify-center gap-4 border-y border-separator-strong py-3 text-[10px] font-bold tracking-[0.24em] text-muted uppercase">
        <span className="text-ink">A personal radio station</span>
        <span aria-hidden="true">·</span>
        <span>Broadcasting from a homelab</span>
        <span aria-hidden="true">·</span>
        <span className="text-vermilion">Open source</span>
      </div>
    </section>
  );
}
