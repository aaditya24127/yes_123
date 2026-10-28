import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Logo } from './Logo'
import { headerNavItems, type NavSection } from './navigation'

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const clearDropdownTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const handlePointerEnter = (label: string) => {
    clearDropdownTimeout()
    setActiveDropdown(label)
  }

  const handlePointerLeave = () => {
    clearDropdownTimeout()
    timeoutRef.current = setTimeout(() => {
      setActiveDropdown(null)
    }, 150)
  }

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDropdown(null)
        setMenuOpen(false)
      }
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('click', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('click', handleClickOutside)
      clearDropdownTimeout()
    }
  }, [])

  return (
    <header className="relative z-40 animate-rise-in">
      <Container className="flex h-20 max-w-wide items-center justify-between gap-6">
        <a href="#top" aria-label="CRP Mentor Copilot, back to top" className="rounded-md">
          <Logo />
        </a>

        {/* Desktop navigation with hover & keyboard dropdowns */}
        <nav ref={containerRef} aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-2 xl:gap-4">
            {headerNavItems.map((section: NavSection) => {
              const isOpen = activeDropdown === section.label
              return (
                <li
                  key={section.label}
                  className="relative"
                  onPointerEnter={() => handlePointerEnter(section.label)}
                  onPointerLeave={handlePointerLeave}
                >
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                    aria-controls={`dropdown-${section.label.replace(/\s+/g, '-').toLowerCase()}`}
                    onClick={() => setActiveDropdown((prev) => (prev === section.label ? null : section.label))}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setActiveDropdown(section.label)
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      isOpen
                        ? 'bg-brand-50 text-brand-900'
                        : 'text-muted hover:bg-brand-50/60 hover:text-brand-900'
                    }`}
                  >
                    <span>{section.label}</span>
                    <ChevronDown
                      className={`size-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-900' : 'text-muted'}`}
                      aria-hidden="true"
                    />
                  </button>

                  {/* Dropdown panel */}
                  {isOpen && (
                    <div
                      id={`dropdown-${section.label.replace(/\s+/g, '-').toLowerCase()}`}
                      role="menu"
                      aria-label={`${section.label} overview`}
                      className="absolute top-full left-1/2 z-50 pt-2 -translate-x-1/2 animate-dropdown-fade"
                      onPointerEnter={() => handlePointerEnter(section.label)}
                      onPointerLeave={handlePointerLeave}
                    >
                      <div className="w-[18.5rem] rounded-panel border border-border/80 bg-surface/98 p-2 shadow-raised backdrop-blur-md">
                        <ul className="flex flex-col gap-0.5">
                          {section.items.map((item) => (
                            <li key={item.title}>
                              <a
                                href={item.href}
                                role="menuitem"
                                onClick={() => setActiveDropdown(null)}
                                className="group block rounded-md px-3 py-2 transition-colors hover:bg-brand-50/90 focus-visible:bg-brand-50/90 focus-visible:outline-none"
                              >
                                <p className="text-xs font-semibold text-brand-950 transition-colors group-hover:text-brand-700">
                                  {item.title}
                                </p>
                                {item.description && (
                                  <p className="mt-0.5 text-[0.72rem] leading-relaxed text-muted">
                                    {item.description}
                                  </p>
                                )}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Mobile hamburger button */}
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-full text-brand-900 hover:bg-brand-50 lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
            <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </Container>

      {/* Mobile Drawer */}
      {menuOpen && (
        <div id="mobile-nav" className="absolute inset-x-4 top-full z-50 rounded-card border border-border bg-surface p-3 shadow-raised lg:hidden">
          <nav aria-label="Mobile">
            <ul className="flex flex-col divide-y divide-border/60">
              {headerNavItems.map((section: NavSection) => {
                const isExpanded = mobileExpanded === section.label
                return (
                  <li key={section.label} className="py-1">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setMobileExpanded((prev) => (prev === section.label ? null : section.label))}
                      className="flex w-full items-center justify-between rounded-panel px-3 py-2.5 text-left text-sm font-semibold text-brand-900 hover:bg-brand-50"
                    >
                      <span>{section.label}</span>
                      <ChevronDown
                        className={`size-4 text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                    {isExpanded && (
                      <ul className="mt-1 flex flex-col gap-1 pl-3 pb-2">
                        {section.items.map((item) => (
                          <li key={item.title}>
                            <a
                              href={item.href}
                              onClick={() => {
                                setMenuOpen(false)
                                setMobileExpanded(null)
                              }}
                              className="block rounded-panel px-3 py-1.5 text-left hover:bg-brand-50"
                            >
                              <span className="block text-xs font-medium text-brand-950">{item.title}</span>
                              {item.description && (
                                <span className="block text-[0.7rem] text-muted">{item.description}</span>
                              )}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      )}
    </header>
  )
}
