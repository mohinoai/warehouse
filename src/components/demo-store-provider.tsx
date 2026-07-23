"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { executeBackendCommand } from "@/app/actions";
import { applyCommand } from "@/lib/demo/engine";
import type { CommandResult, DemoCommand, DemoState } from "@/lib/demo/types";

interface DemoStoreValue {
  state: DemoState;
  backendEnabled: boolean;
  execute: (command: DemoCommand) => Promise<CommandResult>;
  resetDemo: () => void;
  failNextOperation: () => void;
}

const DemoStoreContext = createContext<DemoStoreValue | null>(null);

export function DemoStoreProvider({
  children,
  initialState,
  backendEnabled,
}: {
  children: ReactNode;
  initialState: DemoState;
  backendEnabled: boolean;
}) {
  const [state, setState] = useState<DemoState>(initialState);
  const stateRef = useRef(state);

  async function execute(command: DemoCommand): Promise<CommandResult> {
    if (backendEnabled) {
      const outcome = await executeBackendCommand(command);
      if (outcome.state) {
        stateRef.current = outcome.state;
        setState(outcome.state);
      }
      return outcome.result;
    }

    const outcome = applyCommand(stateRef.current, command);
    stateRef.current = outcome.state;
    setState(outcome.state);
    return outcome.result;
  }

  function resetDemo() {
    stateRef.current = initialState;
    setState(initialState);
  }

  function failNextOperation() {
    const next = { ...stateRef.current, failNextOperation: true };
    stateRef.current = next;
    setState(next);
  }

  return (
    <DemoStoreContext.Provider value={{ state, backendEnabled, execute, resetDemo, failNextOperation }}>
      {children}
    </DemoStoreContext.Provider>
  );
}

export function useDemoStore(): DemoStoreValue {
  const value = useContext(DemoStoreContext);
  if (!value) throw new Error("useDemoStore harus dipakai di dalam DemoStoreProvider");
  return value;
}
