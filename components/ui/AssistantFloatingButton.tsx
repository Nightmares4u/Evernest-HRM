"use client";

import Link from "next/link";
import { Bot } from "lucide-react";

export function AssistantFloatingButton() {
  return (
    <Link
      href="/crm/assistant"
      className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg ring-4 ring-blue-50 transition-transform hover:scale-105 hover:bg-blue-700 focus:outline-none focus:ring-blue-100 active:scale-95"
      title="CRM Assistant"
    >
      <Bot className="h-6 w-6" />
    </Link>
  );
}
