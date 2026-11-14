// src/app/[slug]/PinLoginForm.tsx
// Client component for the PIN login form (placeholder behavior).

"use client";

import React from "react";

export default function PinLoginForm() {
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // eslint-disable-next-line no-alert
    alert("PIN login not available yet.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium" htmlFor="admission">
          Admission Number
        </label>
        <input
          id="admission"
          name="admission"
          type="text"
          required
          className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="pin">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          required
          className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
      >
        Login
      </button>
    </form>
  );
}
