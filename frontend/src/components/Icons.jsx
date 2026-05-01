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

export function IconUser(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M4.2 21a7.8 7.8 0 0 1 15.6 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconPalette(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M12 3a9 9 0 0 0 0 18h1.8a2.2 2.2 0 0 0 0-4.4H13a2 2 0 0 1 0-4h3a4.5 4.5 0 0 0 0-9H12z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="7.6" cy="10.2" r="1.2" fill="currentColor" />
      <circle cx="10.5" cy="7.6" r="1.2" fill="currentColor" />
      <circle cx="14.1" cy="7.8" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function IconLock(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M7.5 11V8.7A4.5 4.5 0 0 1 12 4.2a4.5 4.5 0 0 1 4.5 4.5V11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6.5 11h11a2 2 0 0 1 2 2v6.2a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconBell(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M18 16H6c1.3-1.2 2-2.8 2-4.5V10a4 4 0 0 1 8 0v1.5c0 1.7.7 3.3 2 4.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M10 18a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconDatabase(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <ellipse cx="12" cy="6.2" rx="7.5" ry="3.2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4.5 6.2v5.8c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V6.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 12v5.8c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconBattery(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M3.8 9.2A2.2 2.2 0 0 1 6 7h12a2.2 2.2 0 0 1 2.2 2.2v5.6A2.2 2.2 0 0 1 18 17H6a2.2 2.2 0 0 1-2.2-2.2V9.2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M22 10.2v3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 10h6.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconDevices(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M7 7.2A2.2 2.2 0 0 1 9.2 5h10.6A2.2 2.2 0 0 1 22 7.2v6.8a2.2 2.2 0 0 1-2.2 2.2H9.2A2.2 2.2 0 0 1 7 14V7.2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 19h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M2 9.2A2.2 2.2 0 0 1 4.2 7H7v9H4.2A2.2 2.2 0 0 1 2 13.8V9.2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconGlobe(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3.4 12h17.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 3c2.7 2.5 4.3 5.6 4.3 9s-1.6 6.5-4.3 9c-2.7-2.5-4.3-5.6-4.3-9S9.3 5.5 12 3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconSliders(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path d="M4 6h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 6h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 6v0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="6" r="2" stroke="currentColor" strokeWidth="2" />
      <path d="M4 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="8" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
      <path d="M4 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="14" cy="18" r="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconHelp(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9.5 9.5a2.6 2.6 0 0 1 5 1c0 2-2 2.2-2 3.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="17.2" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconShield(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M12 3l7 3v6c0 5-3.2 8.6-7 9.9C8.2 20.6 5 17 5 12V6l7-3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconInfo(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M12 10.5v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function IconLogout(props) {
  return (
    <svg {...baseProps(props)} fill="none">
      <path
        d="M10 7V6a2.5 2.5 0 0 1 2.5-2.5H18A2.5 2.5 0 0 1 20.5 6v12A2.5 2.5 0 0 1 18 20.5h-5.5A2.5 2.5 0 0 1 10 18v-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M3.5 12h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M6.5 9l-3 3 3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

