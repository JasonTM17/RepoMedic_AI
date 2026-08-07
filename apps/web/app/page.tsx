import { dashboardDescription, dashboardTitle } from "./page-content";
import RepairDashboard from "./repair-dashboard";

export default function HomePage() {
  return (
    <>
      <main>
        <p aria-label="Breadcrumb">Home / Repair runs</p>
        <h1>{dashboardTitle}</h1>
        <p>{dashboardDescription}</p>
        <p className="environment-note">
          Local mode · runs persist in the API&apos;s local JSON store.
        </p>
        <RepairDashboard />
      </main>
    </>
  );
}
