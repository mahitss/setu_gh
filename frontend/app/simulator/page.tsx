"use client";

import RequireAuth from "@/components/RequireAuth";
import SimulatePage from "../simulate/page";

export default function SimulatorRoute() {
  return (
    <RequireAuth>
      <SimulatePage />
    </RequireAuth>
  );
}
