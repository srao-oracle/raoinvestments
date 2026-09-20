"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { usd } from "@/lib/format";

// Accessible categorical palette (assigned by entity order).
const PALETTE = [
  "#2563eb",
  "#f59e0b",
  "#10b981",
  "#e11d48",
  "#8b5cf6",
  "#14b8a6",
  "#eab308",
  "#64748b",
];

export function AllocationChart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        No holdings yet — allocation appears once you record fills.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius={58}
          outerRadius={88}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: unknown) => usd(Number(value))}
          contentStyle={{
            background: "var(--color-background)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
