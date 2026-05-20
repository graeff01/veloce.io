import { getInitials } from "@/lib/utils";
import { cn } from "@/lib/utils";

const colors = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-pink-500",
  "bg-cyan-500",
];

function colorFromName(name: string): string {
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

interface AvatarProps {
  name: string;
  size?: "xs" | "sm" | "md";
  className?: string;
}

const sizeClasses = {
  xs: "w-5 h-5 text-[9px]",
  sm: "w-7 h-7 text-xs",
  md: "w-8 h-8 text-sm",
};

export function Avatar({ name, size = "sm", className }: AvatarProps) {
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0",
        colorFromName(name),
        sizeClasses[size],
        className
      )}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}
