import React from "react";

export function Button({ variant = "default", className = "", ...props }) {
    const base =
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium border transition";
    const variants = {
        default: "bg-black text-white border-black",
        secondary: "bg-white text-black border-gray-300",
        destructive: "bg-red-600 text-white border-red-600",
        ghost: "bg-transparent border-transparent",
    };
    return (
        <button
            className={`${base} ${variants[variant] || variants.default} ${className}`}
            {...props}
        />
    );
}