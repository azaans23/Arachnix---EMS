'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface DropdownOption {
  label: string;
  value: string;
}

interface CustomDropdownProps {
  id: string;
  name: string;
  placeholder?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: string;
  touched?: boolean;
  icon?: React.ReactNode;
}

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 240;
const VIEWPORT_MARGIN = 12;

export default function CustomDropdown({
  placeholder = 'Select an option',
  options,
  value,
  onChange,
  onBlur,
  error,
  touched,
  icon,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  /** Menu lives in a portal, so it is positioned against the trigger's viewport rect. */
  const measure = useCallback((): MenuPosition | null => {
    const trigger = triggerRef.current;
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, spaceAbove) && spaceAbove > spaceBelow;

    return {
      top: openUp ? rect.top - MENU_GAP : rect.bottom + MENU_GAP,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow)),
      openUp,
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsOpen(false);
      onBlur();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      onBlur();
      triggerRef.current?.focus();
    };
    // Keep the menu glued to the trigger while modals / tables scroll.
    const handleReflow = () => setPosition(measure());

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleReflow);
    window.addEventListener('scroll', handleReflow, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleReflow);
      window.removeEventListener('scroll', handleReflow, true);
    };
  }, [isOpen, onBlur, measure]);

  const selectedOption = options.find((opt) => opt.value === value);

  const menu =
    isOpen && position
      ? createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
              transform: position.openUp ? 'translateY(-100%)' : undefined,
            }}
            className="z-[210] overflow-y-auto overflow-x-hidden rounded-md border border-border bg-surface py-1 shadow-panel animate-fade-in"
          >
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full cursor-pointer truncate px-4 py-2.5 text-left text-sm transition-colors ${
                    option.value === value
                      ? 'bg-canvas font-semibold text-ink'
                      : 'text-ink hover:bg-canvas'
                  }`}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )
      : null;

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          const next = measure();
          if (!next) return;
          setPosition(next);
          setIsOpen(true);
        }}
        className={`relative flex w-full cursor-pointer items-center justify-between gap-2 border bg-surface py-2.5 pr-3 text-left text-ink transition-all focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] ${
          icon ? 'pl-10' : 'pl-3'
        } rounded-md ${
          touched && error
            ? 'border-danger focus:border-danger'
            : isOpen
              ? 'border-ink/40 ring-2 ring-[var(--focus-ring)]'
              : 'border-border hover:border-ink/25'
        }`}
      >
        {icon && (
          <div className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 items-center text-muted/60">
            {icon}
          </div>
        )}
        <span
          className={`min-w-0 truncate text-sm ${selectedOption ? 'font-medium text-ink' : 'text-muted/50'}`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${isOpen ? 'rotate-180 text-ink' : ''}`}
        />
      </button>

      {menu}
    </div>
  );
}
