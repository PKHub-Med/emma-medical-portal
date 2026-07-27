export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="placeholder-page" aria-labelledby="page-title">
      <p className="eyebrow">Emma</p>
      <h1 id="page-title">{title}</h1>
      <div className="placeholder-card">
        <span className="placeholder-icon" aria-hidden="true">◇</span>
        <p>{description}</p>
      </div>
    </section>
  );
}
