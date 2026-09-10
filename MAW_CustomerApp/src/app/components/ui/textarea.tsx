import * as React from "react";

import { cn } from "./utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-h-16 px-3 py-2 text-base rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-[#2563eb] disabled:cursor-not-allowed disabled:opacity-50 resize-y",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };