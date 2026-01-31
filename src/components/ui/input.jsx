import React from "react";

/**
 * Input "neutro": NÃO filtra caracteres.
 * Isso permite digitar vírgula e ponto (ex: 0,01 / 0.01 / 1.234,56).
 */
export function Input({ className = "", style, ...props }) {
    return (
        <input
            {...props}
            className={className}
            style={{
                width: "100%",
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: "8px 10px",
                fontSize: 13,
                outline: "none",
                ...style,
            }}
        />
    );
}