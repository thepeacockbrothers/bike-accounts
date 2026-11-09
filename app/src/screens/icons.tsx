// Simple line icons, drawn on a 24px grid and coloured with currentColor.

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

export const HomeIcon = () => (
  <Svg>
    <path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z" />
  </Svg>
)

export const UploadIcon = () => (
  <Svg>
    <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" />
  </Svg>
)

export const CheckIcon = () => (
  <Svg>
    <path d="M4 12.5 9 17.5 20 6.5" />
  </Svg>
)

export const TaxIcon = () => (
  <Svg>
    <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />
  </Svg>
)

export const SettingsIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3m0 13v3M2.5 12h3m13 0h3M5.3 5.3l2.1 2.1m9.2 9.2 2.1 2.1M5.3 18.7l2.1-2.1m9.2-9.2 2.1-2.1" />
  </Svg>
)

export const PlusIcon = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const SheetIcon = () => (
  <Svg>
    <path d="M4 4h16v16H4zM4 9.5h16M4 15h16M10 4v16" />
  </Svg>
)

export const Chevron = () => (
  <Svg>
    <path d="m9 5 7 7-7 7" />
  </Svg>
)

export const Wheel = () => (
  <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <circle cx="24" cy="24" r="20" />
    <circle cx="24" cy="24" r="3" />
    <path d="M24 4v17M24 27v17M4 24h17M27 24h17M10 10l12 12M26 26l12 12M38 10 26 22M22 26 10 38" strokeWidth="1.2" />
  </svg>
)
