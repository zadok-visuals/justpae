"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/Switch";

/** The shared Switch in both positions, so the knob inset can be eyeballed. */
export function SwitchDemo() {
  const [on, setOn] = useState(true);
  return (
    <div className="flex items-center gap-6">
      <Switch checked={on} onChange={setOn} label="Interactive switch" />
      <Switch checked onChange={() => {}} label="On" />
      <Switch checked={false} onChange={() => {}} label="Off" />
      <Switch checked disabled onChange={() => {}} label="Disabled" />
    </div>
  );
}
