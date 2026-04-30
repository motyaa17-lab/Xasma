import React from "react";

function baseProps(props) {
  return {
    className: props.className,
    width: props.size ?? 20,
    height: props.size ?? 20,
    viewBox: "0 0 24 24",
    "aria-hidden": props["aria-hidden"] ?? true,
    focusable: "false",
  };
}

export function IconChats(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.1 0-2.15-.2-3.1-.55L3 21l1.55-6.4A8.5 8.5 0 1 1 21 11.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPhone(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M22 16.9v2.1a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h2.1a2 2 0 0 1 2 1.7c.1.8.3 1.6.6 2.3a2 2 0 0 1-.5 2.1L7.2 9.2a16 16 0 0 0 7.6 7.6l1.1-1.1a2 2 0 0 1 2.1-.5c.7.3 1.5.5 2.3.6a2 2 0 0 1 1.7 2.1z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconSettings(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a8.3 8.3 0 0 0-1.7-1l-.4-2.7h-4l-.4 2.7a8.3 8.3 0 0 0-1.7 1l-2.5-1-2 3.4 2 1.6a7.9 7.9 0 0 0-.1 1c0 .3 0 .7.1 1l-2 1.6 2 3.4 2.5-1c.5.4 1.1.8 1.7 1l.4 2.7h4l.4-2.7c.6-.2 1.2-.6 1.7-1l2.5 1 2-3.4-2-1.6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconDownload(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M12 3v10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 10.5L12 13.9l4-3.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M5 20h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconEllipsis(props) {
  // Use circles instead of "⋯" so it renders on all platforms/fonts.
  return (
    <svg {...baseProps(props)} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18" cy="12" r="1.7" />
    </svg>
  );
}

export function IconSearch(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M21 21l-4.4-4.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconContacts(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.36"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17.5 3.64A4 4 0 0 1 18 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconCompose(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M12 20h9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

