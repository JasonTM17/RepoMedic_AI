import { dashboardDescription, dashboardTitle } from "./page-content";

export default function HomePage() {
  return (
    <main>
      <p aria-label="Breadcrumb">Home</p>
      <h1>{dashboardTitle}</h1>
      <p>{dashboardDescription}</p>
    </main>
  );
}
