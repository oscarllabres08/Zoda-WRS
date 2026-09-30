export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="page-header">
      <div className="page-header-inner">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}
