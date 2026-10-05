"use client";

import { useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

type GrowingTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value: string;
};

export function GrowingTextarea({ value, ...props }: GrowingTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    if (textarea.scrollHeight > 0) textarea.style.height = `${textarea.scrollHeight + 2}px`;
  });

  return (
    <textarea
      {...props}
      ref={textareaRef}
      value={value}
      className={`${props.className ?? ""} min-w-0 max-w-full resize-none overflow-hidden leading-relaxed`}
    />
  );
}
