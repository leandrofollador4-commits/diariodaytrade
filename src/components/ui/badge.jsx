import React from "react";

export function Badge({ variant = "outline", className = "", children }) {
    const base = "inline-flex items-center rounded-xl px-2 py-1 text-xs border";
    const variants = {
        outline: "bg-white text-black border-gray-300",
        secondary: "bg-gray-100 text-black border-gray-200",
        destructive: "bg-red-600 text-white border-red-600",
        default: "bg-black text-white border-black",
    };
    return (
        <span className={`${base} ${variants[variant] || variants.outline} ${className}`}>
            {children}
        </span>
    );
}