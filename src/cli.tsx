import React from "react";
import { render } from "ink";
import { App } from "./tui/App.tsx";
import { createMockState } from "./mock.ts";

const useDemo = process.argv.includes("--demo");

export async function startWatch() {
  if (useDemo) {
    // Demo mode with mock data
    const state = createMockState();
    const { waitUntilExit } = render(<App initialState={state} />);
    await waitUntilExit();
  } else {
    // Live mode — observe .oswarm/events/
    const { LiveApp } = await import("./tui/LiveApp.tsx");
    const projectDir = process.cwd();
    const { waitUntilExit } = render(<LiveApp projectDir={projectDir} />);
    await waitUntilExit();
  }
}

if (import.meta.main) {
  await startWatch();
}
